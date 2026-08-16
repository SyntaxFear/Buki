#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_ROOT = path.join(
  ROOT,
  "docs",
  "build-in-public-assets",
  "weekly-x",
  "generated",
);

export const WEEKLY_X_CAMPAIGN = Object.freeze({
  product: "Buki",
  account: "@Parastashvilii",
  timezone: "Asia/Tbilisi",
  landingPage: "https://buki.expo.app/",
  firstWeekStart: "2026-08-16",
  finalWeekStart: "2026-10-25",
  endDate: "2026-10-31",
  plannerWeekday: "Saturday",
  plannerTime: "09:00",
  verifierTime: "19:15",
  transport: "brave-extension",
});

export const WEEKLY_CATEGORY_QUOTAS = Object.freeze({
  "product-demo": 4,
  "technical-lesson": 3,
  testing: 2,
  "builder-process": 2,
  "app-store-process": 1,
  "user-problem": 1,
  "weekly-reflection": 1,
});

export const WEEKLY_MEDIA_TARGETS = Object.freeze({
  minimumVideos: 4,
  minimumScreenshots: 6,
  maximumCards: 4,
  total: 14,
});

export const WEEKLY_POST_WINDOWS = Object.freeze({
  early: Object.freeze({ start: "13:00", end: "13:30" }),
  late: Object.freeze({ start: "18:30", end: "19:00" }),
});

const REQUIRED_HASHTAGS = Object.freeze(["#Shipaton", "#BuildInPublic"]);
const VALID_CATEGORIES = new Set(Object.keys(WEEKLY_CATEGORY_QUOTAS));
const VALID_MEDIA_KINDS = new Set(["video", "screenshot", "card"]);
const BANNED_COPY = [
  /\bgame[ -]?changer\b/i,
  /\bthrilled to announce\b/i,
  /\brevolutionary\b/i,
  /\bseamless experience\b/i,
  /\bunlock\b/i,
  /\bleverage\b/i,
  /\bdelve\b/i,
  /🚢/u,
  /—/u,
];
const METRIC_CLAIM =
  /\b\d[\d,.]*\+?\s*(downloads?|installs?|testers?|users?|revenue|sales|subscriptions?|subscribers?)\b/i;
const UNSTABLE_APPLE_STATUS =
  /\b(waiting for review|in review|pending developer release|ready for sale|approved by apple|rejected by apple|testflight (is )?(live|available|ready))\b/i;

function parseArgs(argv) {
  const options = { mode: "template" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--template") options.mode = "template";
    else if (arg === "--validate") options.mode = "validate";
    else if (arg === "--week-start") options.weekStart = argv[++index];
    else if (arg === "--input") options.input = argv[++index];
    else if (arg === "--history") options.history = argv[++index];
    else if (arg === "--previous-manifest")
      options.previousManifest = argv[++index];
    else if (arg === "--output-root") options.outputRoot = argv[++index];
    else if (arg === "--now") options.now = new Date(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.weekStart) throw new Error("--week-start YYYY-MM-DD is required.");
  if (options.mode === "validate" && !options.input)
    throw new Error("--input <weekly-copy.json> is required with --validate.");
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

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function timestamp(now = new Date()) {
  return now.toISOString().replaceAll(/[-:]/g, "").replace(".", "-");
}

function addDays(date, amount) {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + amount);
  return instant.toISOString().slice(0, 10);
}

function compareDates(left, right) {
  return String(left).localeCompare(String(right));
}

export function validateWeekStart(weekStart) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart)))
    return [`Invalid week start: ${weekStart}.`];
  const instant = new Date(`${weekStart}T12:00:00Z`);
  if (Number.isNaN(instant.getTime())) return [`Invalid week start: ${weekStart}.`];
  if (instant.getUTCDay() !== 0)
    errors.push(`${weekStart} is not a Sunday.`);
  if (compareDates(weekStart, WEEKLY_X_CAMPAIGN.firstWeekStart) < 0)
    errors.push(`Weekly X starts on ${WEEKLY_X_CAMPAIGN.firstWeekStart}.`);
  if (compareDates(weekStart, WEEKLY_X_CAMPAIGN.finalWeekStart) > 0)
    errors.push(`Weekly X ends with the ${WEEKLY_X_CAMPAIGN.finalWeekStart} week.`);
  if (compareDates(addDays(weekStart, 6), WEEKLY_X_CAMPAIGN.endDate) > 0)
    errors.push(`The week would create posts after ${WEEKLY_X_CAMPAIGN.endDate}.`);
  return errors;
}

export function weekDates(weekStart) {
  const errors = validateWeekStart(weekStart);
  if (errors.length) throw new Error(errors.join(" "));
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function minutePool(seed) {
  const start = Number.parseInt(sha256Text(seed).slice(0, 8), 16) % 31;
  const step = 11;
  return Array.from({ length: 31 }, (_, index) => (start + index * step) % 31);
}

function minuteFromTime(value, slot) {
  const [hour, minute] = String(value ?? "").split(":").map(Number);
  if (slot === "early" && hour === 13 && minute >= 0 && minute <= 30)
    return minute;
  if (slot === "late") {
    if (hour === 18 && minute >= 30 && minute <= 59) return minute - 30;
    if (hour === 19 && minute === 0) return 30;
  }
  return null;
}

function timeFromMinute(slot, value) {
  if (slot === "early") return `13:${String(value).padStart(2, "0")}`;
  if (value === 30) return "19:00";
  return `18:${String(30 + value).padStart(2, "0")}`;
}

function previousTimes(previousManifest, slot) {
  const result = new Map();
  for (const post of previousManifest?.posts ?? []) {
    if (post.slot !== slot) continue;
    const weekday = new Date(`${post.date}T12:00:00Z`).getUTCDay();
    result.set(weekday, post.scheduledLocalTime);
  }
  return result;
}

export function scheduleForWeek(weekStart, previousManifest = null) {
  const dates = weekDates(weekStart);
  const schedule = [];
  for (const slot of ["early", "late"]) {
    const pool = minutePool(`${weekStart}:${slot}`);
    const used = new Set();
    const prior = previousTimes(previousManifest, slot);
    for (const date of dates) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const priorMinute = minuteFromTime(prior.get(weekday), slot);
      const selected = pool.find(
        (candidate) => !used.has(candidate) && candidate !== priorMinute,
      );
      used.add(selected);
      schedule.push({
        id: `${date}-${slot}`,
        date,
        slot,
        scheduledLocalTime: timeFromMinute(slot, selected),
      });
    }
  }
  return schedule.sort((left, right) =>
    `${left.date}:${left.slot === "early" ? "0" : "1"}`.localeCompare(
      `${right.date}:${right.slot === "early" ? "0" : "1"}`,
    ),
  );
}

export function createWeeklyTemplate(weekStart, previousManifest = null) {
  const schedule = scheduleForWeek(weekStart, previousManifest);
  return {
    schemaVersion: 1,
    campaign: WEEKLY_X_CAMPAIGN,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    generatedAt: new Date().toISOString(),
    approvalRequired: true,
    categoryQuotas: WEEKLY_CATEGORY_QUOTAS,
    mediaTargets: WEEKLY_MEDIA_TARGETS,
    requiredQuestionCount: 10,
    requiredLinkRange: { minimum: 2, maximum: 3 },
    posts: schedule.map((slot) => ({
      ...slot,
      category: "",
      topic: "",
      angle: "",
      hook: "",
      text: "",
      question: null,
      hashtags: [],
      link: null,
      freshEvidence: false,
      evidenceSources: [],
      media: {
        kind: "",
        path: "",
        sha256: "",
        sourceType: "",
      },
    })),
  };
}

export function normalizeCopy(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function shingles(value) {
  const words = normalizeCopy(value).split(" ").filter(Boolean);
  if (words.length < 2) return new Set(words);
  return new Set(words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`));
}

export function nearDuplicateScore(left, right) {
  const a = shingles(left);
  const b = shingles(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

function hashtagsIn(text) {
  return [...String(text).matchAll(/#[A-Za-z0-9_]+/g)].map((match) => match[0]);
}

function hashtagKey(tags) {
  return [...new Set(tags.map((tag) => tag.toLowerCase()))].sort().join("|");
}

function topicAngleKey(post) {
  return `${normalizeCopy(post.topic)}::${normalizeCopy(post.angle)}`;
}

function latinLetterRatio(text) {
  const letters = [...String(text)].filter((character) => /\p{L}/u.test(character));
  if (!letters.length) return 1;
  return letters.filter((character) => /[A-Za-z]/.test(character)).length / letters.length;
}

function errorFor(errorsByDate, date, message) {
  if (!errorsByDate[date]) errorsByDate[date] = [];
  errorsByDate[date].push(message);
}

function validatePostShape(post, expected, errorsByDate) {
  const errors = [];
  if (post.id !== expected.id) errors.push(`Expected id ${expected.id}.`);
  if (post.date !== expected.date) errors.push(`Expected date ${expected.date}.`);
  if (post.slot !== expected.slot) errors.push(`Expected slot ${expected.slot}.`);
  if (post.scheduledLocalTime !== expected.scheduledLocalTime)
    errors.push(`Expected scheduled time ${expected.scheduledLocalTime}.`);
  if (!VALID_CATEGORIES.has(post.category))
    errors.push(`Unsupported category: ${post.category || "missing"}.`);
  const length = [...String(post.text ?? "")].length;
  if (!length) errors.push("Post text is missing.");
  if (length > 280) errors.push(`Post is ${length} characters; limit is 280.`);
  if (latinLetterRatio(post.text) < 0.9) errors.push("Post must be written in English.");
  for (const pattern of BANNED_COPY)
    if (pattern.test(String(post.text))) errors.push(`Plainspoken violation: ${pattern}.`);
  if (METRIC_CLAIM.test(String(post.text)))
    errors.push("Download, tester, user, revenue, or sales metrics are not allowed.");
  if (UNSTABLE_APPLE_STATUS.test(String(post.text)))
    errors.push("Unstable App Store or TestFlight status claims are not allowed.");

  const actualTags = hashtagsIn(post.text);
  const declaredTags = Array.isArray(post.hashtags) ? post.hashtags : [];
  if (actualTags.length < 3 || actualTags.length > 4)
    errors.push(`Post must contain 3–4 hashtags; found ${actualTags.length}.`);
  if (hashtagKey(actualTags) !== hashtagKey(declaredTags))
    errors.push("Declared hashtags do not match the caption.");
  for (const tag of REQUIRED_HASHTAGS)
    if (!actualTags.some((actual) => actual.toLowerCase() === tag.toLowerCase()))
      errors.push(`Post is missing ${tag}.`);

  const question = post.question == null ? null : String(post.question).trim();
  if (question) {
    if (!question.endsWith("?")) errors.push("The engagement question must end with ?.");
    if (!String(post.text).includes(question))
      errors.push("The declared engagement question is not present in the caption.");
  } else if (String(post.text).includes("?")) {
    errors.push("Caption contains a question but question is null.");
  }

  const link = post.link == null ? null : String(post.link).trim();
  const urls = [...String(post.text).matchAll(/https?:\/\/\S+/g)].map((match) =>
    match[0].replace(/[),.!?]+$/, ""),
  );
  if (link) {
    if (link !== WEEKLY_X_CAMPAIGN.landingPage)
      errors.push("Only the verified Buki landing-page link is allowed.");
    if (!urls.includes(link)) errors.push("The declared link is not present in the caption.");
  } else if (urls.length) errors.push("Caption contains a URL but link is null.");

  if (!String(post.hook ?? "").trim()) errors.push("Hook is missing.");
  if (!String(post.topic ?? "").trim()) errors.push("Topic is missing.");
  if (!String(post.angle ?? "").trim()) errors.push("Angle is missing.");
  if (!Array.isArray(post.evidenceSources) || !post.evidenceSources.length)
    errors.push("At least one evidence source is required.");
  if (!VALID_MEDIA_KINDS.has(post.media?.kind))
    errors.push(`Unsupported media kind: ${post.media?.kind || "missing"}.`);
  if (!String(post.media?.path ?? "").trim()) errors.push("Media path is missing.");
  if (!/^[a-f0-9]{64}$/i.test(String(post.media?.sha256 ?? "")))
    errors.push("Media SHA-256 is missing or invalid.");
  if (!String(post.media?.sourceType ?? "").trim())
    errors.push("Media source type is missing.");
  for (const error of errors) errorFor(errorsByDate, expected.date, `${expected.id}: ${error}`);
}

function validateQuota(posts, globalErrors) {
  const counts = Object.fromEntries(Object.keys(WEEKLY_CATEGORY_QUOTAS).map((key) => [key, 0]));
  for (const post of posts) if (post.category in counts) counts[post.category] += 1;
  for (const [category, expected] of Object.entries(WEEKLY_CATEGORY_QUOTAS))
    if (counts[category] !== expected)
      globalErrors.push(`${category} requires ${expected}; found ${counts[category]}.`);
}

function validateWeeklyTotals(posts, globalErrors) {
  const questions = posts.filter((post) => String(post.question ?? "").trim()).length;
  if (questions !== 10) globalErrors.push(`Exactly 10 posts need questions; found ${questions}.`);
  const links = posts.filter((post) => post.link === WEEKLY_X_CAMPAIGN.landingPage).length;
  if (links < 2 || links > 3)
    globalErrors.push(`The Buki link must appear in 2–3 posts; found ${links}.`);
  const mediaCounts = { video: 0, screenshot: 0, card: 0 };
  for (const post of posts)
    if (post.media?.kind in mediaCounts) mediaCounts[post.media.kind] += 1;
  if (mediaCounts.video < WEEKLY_MEDIA_TARGETS.minimumVideos)
    globalErrors.push(`At least 4 videos are required; found ${mediaCounts.video}.`);
  if (mediaCounts.screenshot < WEEKLY_MEDIA_TARGETS.minimumScreenshots)
    globalErrors.push(`At least 6 screenshots are required; found ${mediaCounts.screenshot}.`);
  if (mediaCounts.card > WEEKLY_MEDIA_TARGETS.maximumCards)
    globalErrors.push(`At most 4 cards are allowed; found ${mediaCounts.card}.`);
}

function compareForDuplicates(posts, history, errorsByDate) {
  const seen = [];
  for (const post of posts) {
    const candidates = [...history, ...seen];
    for (const prior of candidates) {
      const priorLabel = prior.id ?? prior.url ?? prior.date ?? "history item";
      if (normalizeCopy(post.text) === normalizeCopy(prior.text))
        errorFor(errorsByDate, post.date, `${post.id}: caption repeats ${priorLabel}.`);
      else if (nearDuplicateScore(post.text, prior.text) >= 0.72)
        errorFor(errorsByDate, post.date, `${post.id}: caption is too similar to ${priorLabel}.`);
      if (normalizeCopy(post.hook) && normalizeCopy(post.hook) === normalizeCopy(prior.hook))
        errorFor(errorsByDate, post.date, `${post.id}: hook repeats ${priorLabel}.`);
      if (
        normalizeCopy(post.question) &&
        normalizeCopy(post.question) === normalizeCopy(prior.question)
      )
        errorFor(errorsByDate, post.date, `${post.id}: question repeats ${priorLabel}.`);
      if (hashtagKey(post.hashtags ?? []) === hashtagKey(prior.hashtags ?? []))
        errorFor(errorsByDate, post.date, `${post.id}: hashtag set repeats ${priorLabel}.`);
      if (
        post.media?.sha256 &&
        post.media.sha256.toLowerCase() === String(prior.media?.sha256 ?? "").toLowerCase()
      )
        errorFor(errorsByDate, post.date, `${post.id}: media repeats ${priorLabel}.`);
      if (topicAngleKey(post) === topicAngleKey(prior))
        errorFor(errorsByDate, post.date, `${post.id}: topic and angle repeat ${priorLabel}.`);
      if (
        normalizeCopy(post.topic) === normalizeCopy(prior.topic) &&
        (!post.freshEvidence || normalizeCopy(post.angle) === normalizeCopy(prior.angle))
      )
        errorFor(
          errorsByDate,
          post.date,
          `${post.id}: returning to ${post.topic} requires fresh evidence and a new angle.`,
        );
    }
    seen.push(post);
  }
}

async function validateMediaFiles(posts, errorsByDate) {
  for (const post of posts) {
    const mediaPath = path.resolve(ROOT, post.media?.path ?? "");
    if (!(await exists(mediaPath))) {
      errorFor(errorsByDate, post.date, `${post.id}: media does not exist: ${mediaPath}.`);
      continue;
    }
    const actual = await sha256File(mediaPath);
    if (actual.toLowerCase() !== String(post.media.sha256).toLowerCase())
      errorFor(errorsByDate, post.date, `${post.id}: media SHA-256 does not match.`);
  }
}

export async function validateWeeklyPackage(input, {
  previousManifest = null,
  history = [],
} = {}) {
  const globalErrors = validateWeekStart(input.weekStart);
  if (input.campaign?.account && input.campaign.account !== WEEKLY_X_CAMPAIGN.account)
    globalErrors.push(`Expected account ${WEEKLY_X_CAMPAIGN.account}.`);
  if (!Array.isArray(input.posts) || input.posts.length !== 14)
    globalErrors.push(`Exactly 14 posts are required; found ${input.posts?.length ?? 0}.`);
  const posts = Array.isArray(input.posts) ? input.posts : [];
  const expectedSchedule = scheduleForWeek(input.weekStart, previousManifest);
  const errorsByDate = Object.fromEntries(weekDates(input.weekStart).map((date) => [date, []]));
  for (const [index, expected] of expectedSchedule.entries())
    validatePostShape(posts[index] ?? {}, expected, errorsByDate);
  validateQuota(posts, globalErrors);
  validateWeeklyTotals(posts, globalErrors);
  compareForDuplicates(posts, history, errorsByDate);
  await validateMediaFiles(posts, errorsByDate);

  const hashtagSets = new Map();
  for (const post of posts) {
    const key = hashtagKey(post.hashtags ?? []);
    if (!key) continue;
    if (hashtagSets.has(key))
      errorFor(
        errorsByDate,
        post.date,
        `${post.id}: hashtag set repeats ${hashtagSets.get(key)} in this week.`,
      );
    else hashtagSets.set(key, post.id);
  }

  const days = weekDates(input.weekStart).map((date) => ({
    date,
    status: globalErrors.length || errorsByDate[date].length ? "held" : "ready",
    errors: [...globalErrors, ...errorsByDate[date]],
    postIds: posts.filter((post) => post.date === date).map((post) => post.id),
  }));
  const readyDays = days.filter((day) => day.status === "ready").length;
  return {
    globalErrors,
    errorsByDate,
    days,
    status: globalErrors.length || readyDays === 0 ? "blocked" : "approval_required",
  };
}

function canonicalBatch(posts) {
  return posts.map((post) => ({
    id: post.id,
    date: post.date,
    slot: post.slot,
    scheduledLocalTime: post.scheduledLocalTime,
    text: post.text,
    mediaSha256: post.media?.sha256,
  }));
}

export function weeklyApprovalMarkdown(manifest) {
  const sections = manifest.days.map((day) => {
    const posts = manifest.posts.filter((post) => post.date === day.date);
    const body = posts
      .map(
        (post) =>
          `### ${post.scheduledLocalTime} — ${post.category}\n\n${post.text}\n\n- Media: ${post.media.path}\n- SHA-256: ${post.media.sha256}\n- Evidence: ${post.evidenceSources.join(", ")}`,
      )
      .join("\n\n");
    const errors = day.errors.length
      ? `\n\nHeld because:\n${day.errors.map((error) => `- ${error}`).join("\n")}`
      : "";
    return `## ${day.date} — ${day.status.toUpperCase()}\n\n${body}${errors}`;
  });
  return `# Buki X weekly approval — ${manifest.weekStart} to ${manifest.weekEnd}\n\nStatus: **${manifest.status}**\n\nAccount: ${manifest.campaign.account}\n\nTransport: dedicated background Brave tab\n\nBatch SHA-256: ${manifest.batchSha256}\n\nOne action-time confirmation is required before scheduling any ready post. Held days must not be scheduled. Past slots must be skipped, never backfilled.\n\n${sections.join("\n\n")}\n`;
}

async function loadHistory(options, outputRoot) {
  const items = [];
  if (options.history) {
    const supplied = await readJson(path.resolve(options.history));
    items.push(...(Array.isArray(supplied) ? supplied : supplied.items ?? []));
  }
  if (await exists(outputRoot)) {
    for (const week of await readdir(outputRoot, { withFileTypes: true })) {
      if (!week.isDirectory()) continue;
      if (week.name === options.weekStart) continue;
      const latestPath = path.join(outputRoot, week.name, "latest.json");
      if (!(await exists(latestPath))) continue;
      const latest = await readJson(latestPath);
      const manifestPath = path.resolve(ROOT, latest.manifest);
      if (!(await exists(manifestPath))) continue;
      const manifest = await readJson(manifestPath);
      items.push(...(manifest.posts ?? []));
    }
  }
  return items;
}

async function resolvePreviousManifest(options, outputRoot) {
  if (options.previousManifest)
    return readJson(path.resolve(options.previousManifest));
  const priorStart = addDays(options.weekStart, -7);
  const latestPath = path.join(outputRoot, priorStart, "latest.json");
  if (!(await exists(latestPath))) return null;
  const latest = await readJson(latestPath);
  return readJson(path.resolve(ROOT, latest.manifest));
}

async function writeTemplate(options, outputRoot, previousManifest) {
  const template = createWeeklyTemplate(options.weekStart, previousManifest);
  const weekDir = path.join(outputRoot, options.weekStart);
  await mkdir(weekDir, { recursive: true });
  const templatePath = path.join(weekDir, "template.json");
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`);
  process.stdout.write(`Template: ${path.relative(ROOT, templatePath)}\n`);
}

async function writeValidatedManifest(options, outputRoot, previousManifest) {
  const inputPath = path.resolve(options.input);
  const input = await readJson(inputPath);
  if (input.weekStart !== options.weekStart)
    throw new Error(`Input week ${input.weekStart} does not match ${options.weekStart}.`);
  const history = await loadHistory(options, outputRoot);
  const validation = await validateWeeklyPackage(input, { previousManifest, history });
  const runDir = path.join(outputRoot, options.weekStart, timestamp(options.now));
  await mkdir(runDir, { recursive: true });
  const manifest = {
    ...input,
    schemaVersion: 1,
    campaign: WEEKLY_X_CAMPAIGN,
    weekEnd: addDays(options.weekStart, 6),
    validatedAt: new Date().toISOString(),
    validation,
    days: validation.days,
    status: validation.status,
    approval: null,
    externalActionPerformed: false,
    batchSha256: sha256Text(JSON.stringify(canonicalBatch(input.posts))),
    sourceInput: path.relative(ROOT, inputPath),
  };
  const manifestPath = path.join(runDir, "weekly-manifest.json");
  const approvalPath = path.join(runDir, "approval.md");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(approvalPath, weeklyApprovalMarkdown(manifest));
  const latestPath = path.join(outputRoot, options.weekStart, "latest.json");
  await writeFile(
    latestPath,
    `${JSON.stringify({
      weekStart: options.weekStart,
      status: manifest.status,
      batchSha256: manifest.batchSha256,
      manifest: path.relative(ROOT, manifestPath),
      approval: path.relative(ROOT, approvalPath),
    }, null, 2)}\n`,
  );
  process.stdout.write(`${manifest.status.toUpperCase()} ${options.weekStart}\n`);
  process.stdout.write(`Manifest: ${path.relative(ROOT, manifestPath)}\n`);
  process.stdout.write(`Approval: ${path.relative(ROOT, approvalPath)}\n`);
  const held = manifest.days.filter((day) => day.status === "held");
  for (const day of held)
    process.stdout.write(`Held ${day.date}: ${day.errors.join(" | ")}\n`);
  if (manifest.status === "blocked") process.exitCode = 2;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputRoot = path.resolve(options.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  const previousManifest = await resolvePreviousManifest(options, outputRoot);
  if (options.mode === "template")
    await writeTemplate(options, outputRoot, previousManifest);
  else await writeValidatedManifest(options, outputRoot, previousManifest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
