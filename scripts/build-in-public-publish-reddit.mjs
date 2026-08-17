#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPAIGN, resolveCampaignDay } from "./build-in-public-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_ENV = path.join(ROOT, ".env.build-in-public.local");
if (existsSync(LOCAL_ENV)) process.loadEnvFile(LOCAL_ENV);
const GENERATED_ROOT = path.join(
  ROOT,
  "docs",
  "build-in-public-assets",
  "30-day",
  "generated",
);
const REDDIT_TOKEN_ENDPOINT = "https://www.reddit.com/api/v1/access_token";
const REDDIT_API = "https://oauth.reddit.com";

function parseArgs(argv) {
  const options = { publish: false, dryRun: false, inspectRules: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--today") options.today = true;
    else if (arg === "--publish") options.publish = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--inspect-rules") options.inspectRules = true;
    else if (arg === "--day") options.day = argv[++index];
    else if (arg === "--date") options.date = argv[++index];
    else if (arg === "--subreddit") options.subreddit = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if ([options.publish, options.dryRun, options.inspectRules].filter(Boolean).length > 1) {
    throw new Error("Choose one of --publish, --dry-run, or --inspect-rules.");
  }
  if (!options.publish && !options.dryRun && !options.inspectRules) {
    options.dryRun = true;
  }
  return options;
}

async function exists(file) {
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(file) {
  return sha256(await readFile(file));
}

function parseJsonEnv(name, fallback = {}) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON.`);
  }
}

function redditConfig() {
  return {
    apiAccessApproved: process.env.REDDIT_API_ACCESS_APPROVED === "true",
    clientId: process.env.REDDIT_CLIENT_ID?.trim(),
    clientSecret: process.env.REDDIT_CLIENT_SECRET ?? "",
    refreshToken: process.env.REDDIT_REFRESH_TOKEN?.trim(),
    userAgent: process.env.REDDIT_USER_AGENT?.trim(),
    accountUsername: process.env.REDDIT_ACCOUNT_USERNAME?.trim(),
    targets: parseJsonEnv("BIP_REDDIT_TARGETS_JSON"),
    ruleApprovals: parseJsonEnv("BIP_REDDIT_RULE_APPROVALS_JSON"),
    publishTime: process.env.BIP_REDDIT_PUBLISH_TIME?.trim() || "18:30",
  };
}

export function redditBodyFromDraft(draft, headline) {
  const normalized = String(draft ?? "").replaceAll("\r\n", "\n").trim();
  const lines = normalized.split("\n");
  if (lines[0]?.trim() === String(headline).trim()) {
    lines.shift();
    while (!lines[0]?.trim()) lines.shift();
  }
  return lines.join("\n").trim();
}

export function canonicalRedditRules(payload) {
  const rules = (payload?.rules ?? []).map((rule) => ({
    kind: rule.kind ?? null,
    shortName: rule.short_name ?? "",
    description: rule.description ?? "",
    violationReason: rule.violation_reason ?? "",
  }));
  rules.sort((left, right) =>
    `${left.shortName}:${left.kind}`.localeCompare(`${right.shortName}:${right.kind}`),
  );
  return JSON.stringify(rules);
}

export function redditRulesSha256(payload) {
  return sha256(canonicalRedditRules(payload));
}

function localClock(timeZone = CAMPAIGN.timezone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function redditPublishWindowOpen({
  date,
  publishTime = "18:30",
  timeZone = CAMPAIGN.timezone,
  now = new Date(),
} = {}) {
  const clock = localClock(timeZone, now);
  return clock.date === date && clock.time >= publishTime;
}

async function redditToken(config) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
  });
  const response = await fetch(REDDIT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.userAgent,
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Reddit OAuth returned HTTP ${response.status}: ${text}`);
  }
  const payload = JSON.parse(text);
  if (!payload.access_token) throw new Error("Reddit OAuth returned no access token.");
  return payload.access_token;
}

async function redditRequest({ token, userAgent, pathname, method = "GET", body }) {
  let response;
  try {
    response = await fetch(`${REDDIT_API}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": userAgent,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
    });
  } catch (error) {
    const uncertain = new Error(
      `Reddit request ended without a response: ${error instanceof Error ? error.message : error}`,
    );
    uncertain.uncertain = method !== "GET";
    throw uncertain;
  }
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Reddit returned HTTP ${response.status}: ${text}`);
    error.uncertain = method !== "GET" && response.status >= 500;
    throw error;
  }
  return JSON.parse(text);
}

async function fetchSubredditRules({ token, userAgent, subreddit }) {
  return redditRequest({
    token,
    userAgent,
    pathname: `/r/${encodeURIComponent(subreddit)}/about/rules`,
  });
}

async function fetchSubredditFlairs({ token, userAgent, subreddit }) {
  return redditRequest({
    token,
    userAgent,
    pathname: `/r/${encodeURIComponent(subreddit)}/api/link_flair_v2`,
  });
}

export function findShipatonFlair(flairs = []) {
  const matches = flairs.filter((flair) => /shipaton/i.test(flair?.text ?? ""));
  return matches.length === 1 ? matches[0] : null;
}

async function submitRedditPost({
  token,
  userAgent,
  subreddit,
  title,
  text,
  flairId,
}) {
  const payload = await redditRequest({
    token,
    userAgent,
    pathname: "/api/submit",
    method: "POST",
    body: new URLSearchParams({
      api_type: "json",
      kind: "self",
      resubmit: "false",
      sendreplies: "true",
      sr: subreddit,
      title,
      text,
      flair_id: flairId,
    }),
  });
  const errors = payload?.json?.errors ?? [];
  if (errors.length) {
    throw new Error(
      `Reddit rejected the post: ${errors.map((item) => item.join(": ")).join(" | ")}`,
    );
  }
  const data = payload?.json?.data;
  if (!data?.name || !data?.url) {
    const uncertain = new Error("Reddit returned no post ID or URL after submission.");
    uncertain.uncertain = true;
    throw uncertain;
  }
  return data;
}

async function readBackRedditPost({ token, userAgent, fullname }) {
  const payload = await redditRequest({
    token,
    userAgent,
    pathname: `/api/info?id=${encodeURIComponent(fullname)}&raw_json=1`,
  });
  const post = payload?.data?.children?.[0]?.data;
  if (!post?.name) throw new Error("Reddit post read-back returned no post.");
  return post;
}

async function writeManifest(file, manifest) {
  manifest.updatedAt = new Date().toISOString();
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const day = resolveCampaignDay({ id: options.day, date: options.date });
  if (!day) throw new Error("No campaign day matches the requested Reddit run.");
  if (!day.platforms.includes("Reddit")) {
    process.stdout.write(`${day.id}: Reddit is not scheduled; no action.\n`);
    return;
  }

  const config = redditConfig();
  const subreddit = options.subreddit ?? config.targets[day.id];
  const credentialMissing = [
    !config.apiAccessApproved && "REDDIT_API_ACCESS_APPROVED=true is required.",
    !config.clientId && "REDDIT_CLIENT_ID is not configured.",
    !config.refreshToken && "REDDIT_REFRESH_TOKEN is not configured.",
    !config.userAgent && "REDDIT_USER_AGENT is not configured.",
    !config.accountUsername && "REDDIT_ACCOUNT_USERNAME is not configured.",
    !subreddit && `BIP_REDDIT_TARGETS_JSON has no subreddit for ${day.id}.`,
  ].filter(Boolean);

  if (options.inspectRules) {
    if (credentialMissing.length) throw new Error(credentialMissing.join(" | "));
    const token = await redditToken(config);
    const rules = await fetchSubredditRules({
      token,
      userAgent: config.userAgent,
      subreddit,
    });
    const flairs = await fetchSubredditFlairs({
      token,
      userAgent: config.userAgent,
      subreddit,
    });
    const shipatonFlair = findShipatonFlair(flairs);
    process.stdout.write(
      `${JSON.stringify({ subreddit, sha256: redditRulesSha256(rules), shipatonFlair: shipatonFlair ? { id: shipatonFlair.id, text: shipatonFlair.text } : null, rules: JSON.parse(canonicalRedditRules(rules)) }, null, 2)}\n`,
    );
    return;
  }

  const latestPath = path.join(GENERATED_ROOT, day.id, "latest.json");
  if (!(await exists(latestPath))) throw new Error(`No generated receipt exists for ${day.id}.`);
  const latest = await readJson(latestPath);
  const receiptPath = path.join(ROOT, latest.receipt);
  const receipt = await readJson(receiptPath);
  if (receipt.status !== "ready") {
    throw new Error(
      `${day.id} is ${receipt.status}; missing proof: ${(receipt.missingEvidence ?? []).join(" | ") || "unknown"}`,
    );
  }
  const receiptHash = await sha256File(receiptPath);
  const runDir = path.dirname(receiptPath);
  const manifestPath = path.join(runDir, "publication.json");
  const manifest = (await exists(manifestPath))
    ? await readJson(manifestPath)
    : {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        day: { id: day.id, date: day.date, title: day.title },
        sourceReceipt: path.relative(ROOT, receiptPath),
        sourceReceiptSha256: receiptHash,
        transport: "mixed",
        targets: {},
      };
  if (manifest.sourceReceiptSha256 !== receiptHash) {
    throw new Error("The source receipt changed after the publication manifest was created.");
  }

  const prior = manifest.targets.Reddit;
  if (["publishing", "published", "uncertain", "rules_hold"].includes(prior?.state)) {
    process.stdout.write(`Reddit: ${prior.state} (${prior.providerPostId ?? "no id"})\n`);
    return;
  }

  const title = String(day.headline ?? day.title).trim();
  const body = redditBodyFromDraft(receipt.drafts?.Reddit?.text, title);
  const missing = [...credentialMissing];
  if (!title) missing.push("Reddit title is missing.");
  if (!body) missing.push("Reddit body is missing.");
  if (title.length > 300) missing.push(`Reddit title is ${title.length} characters; limit is 300.`);
  if (/(^|\s)#[\p{L}\p{N}_]+/u.test(`${title}\n${body}`)) {
    missing.push("Reddit copy must not contain decorative hashtags.");
  }
  if (options.publish && !redditPublishWindowOpen({ date: day.date, publishTime: config.publishTime })) {
    missing.push(
      `Reddit publishing opens at ${config.publishTime} ${CAMPAIGN.timezone} on ${day.date}.`,
    );
  }

  let token = null;
  let rules = null;
  let rulesHash = null;
  let shipatonFlair = null;
  if (!missing.length && options.publish) {
    try {
      token = await redditToken(config);
      rules = await fetchSubredditRules({ token, userAgent: config.userAgent, subreddit });
      rulesHash = redditRulesSha256(rules);
      shipatonFlair = findShipatonFlair(
        await fetchSubredditFlairs({
          token,
          userAgent: config.userAgent,
          subreddit,
        }),
      );
      const approvedHash =
        config.ruleApprovals[subreddit] ??
        config.ruleApprovals[subreddit.toLowerCase()];
      if (!approvedHash) {
        missing.push(`No approved current-rules hash is configured for r/${subreddit}.`);
      } else if (approvedHash !== rulesHash) {
        missing.push(
          `Current rules for r/${subreddit} changed: expected ${approvedHash}, received ${rulesHash}.`,
        );
      }
      if (!shipatonFlair) {
        missing.push(
          `r/${subreddit} does not expose exactly one current Shipaton post flair.`,
        );
      }
    } catch (error) {
      missing.push(error instanceof Error ? error.message : String(error));
    }
  }

  manifest.transport = "mixed";
  manifest.targets.Reddit = {
    platform: "Reddit",
    state: missing.length ? "blocked" : options.dryRun ? "dry_run_ready" : "publishing",
    idempotencyKey: `BIP-${day.id}-REDDIT-${sha256(`${receiptHash}:${subreddit}:${title}:${body}`).slice(0, 16)}`,
    subreddit: subreddit ?? null,
    accountUsername: config.accountUsername ?? null,
    localPublishTime: config.publishTime,
    timeZone: CAMPAIGN.timezone,
    title,
    text: body,
    textSha256: sha256(`${title}\n${body}`),
    rulesSha256: rulesHash,
    flairId: shipatonFlair?.id ?? null,
    flairText: shipatonFlair?.text ?? null,
    missing,
    providerPostId: null,
    canonicalUrl: null,
    attemptedAt: options.publish && !missing.length ? new Date().toISOString() : null,
  };
  await writeManifest(manifestPath, manifest);

  if (missing.length) {
    process.stdout.write(`Reddit: BLOCKED — ${missing.join(" | ")}\n`);
    if (options.publish) process.exitCode = 2;
    return;
  }
  if (options.dryRun) {
    process.stdout.write(
      `Reddit: DRY RUN READY for r/${subreddit} at ${config.publishTime} ${CAMPAIGN.timezone}\n`,
    );
    return;
  }

  let submittedPost = null;
  try {
    const submitted = await submitRedditPost({
      token,
      userAgent: config.userAgent,
      subreddit,
      title,
      text: body,
      flairId: shipatonFlair.id,
    });
    submittedPost = submitted;
    const readBack = await readBackRedditPost({
      token,
      userAgent: config.userAgent,
      fullname: submitted.name,
    });
    const readBackMatches =
      readBack.title === title &&
      readBack.selftext === body &&
      readBack.subreddit?.toLowerCase() === subreddit.toLowerCase() &&
      readBack.author?.toLowerCase() === config.accountUsername.toLowerCase() &&
      /shipaton/i.test(readBack.link_flair_text ?? "");
    manifest.targets.Reddit = {
      ...manifest.targets.Reddit,
      state: readBackMatches ? "published" : "uncertain",
      providerPostId: submitted.name,
      canonicalUrl: submitted.url,
      providerReadBack: {
        name: readBack.name,
        title: readBack.title,
        selftext: readBack.selftext,
        subreddit: readBack.subreddit,
        author: readBack.author,
        linkFlairText: readBack.link_flair_text,
        permalink: readBack.permalink,
      },
      captionVerified: readBackMatches,
      confirmedAt: new Date().toISOString(),
      ...(!readBackMatches
        ? { error: "Reddit read-back did not exactly match account, subreddit, title, and body." }
        : {}),
    };
    process.stdout.write(
      `Reddit: ${readBackMatches ? "PUBLISHED" : "UNCERTAIN"} ${submitted.name} ${submitted.url}\n`,
    );
    if (!readBackMatches) process.exitCode = 2;
  } catch (error) {
    const uncertain = Boolean(submittedPost?.name || error?.uncertain);
    manifest.targets.Reddit = {
      ...manifest.targets.Reddit,
      state: uncertain ? "uncertain" : "failed",
      providerPostId:
        submittedPost?.name ?? manifest.targets.Reddit.providerPostId ?? null,
      canonicalUrl:
        submittedPost?.url ?? manifest.targets.Reddit.canonicalUrl ?? null,
      error: error instanceof Error ? error.message : String(error),
    };
    process.stdout.write(
      `Reddit: ${uncertain ? "UNCERTAIN" : "FAILED"} — ${manifest.targets.Reddit.error}\n`,
    );
    process.exitCode = 2;
  }
  await writeManifest(manifestPath, manifest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
