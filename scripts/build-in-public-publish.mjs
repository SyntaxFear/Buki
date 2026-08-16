#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAMPAIGN,
  resolveCampaignDay,
} from "./build-in-public-plan.mjs";
import {
  automaticPublishingTargets,
  scheduledPublishInstant,
} from "./build-in-public-distribution.mjs";

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
const BUFFER_ENDPOINT = "https://api.buffer.com";

function parseArgs(argv) {
  const options = { publish: false, dryRun: false, reconcile: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--today") options.today = true;
    else if (arg === "--publish") options.publish = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--reconcile") options.reconcile = true;
    else if (arg === "--day") options.day = argv[++index];
    else if (arg === "--date") options.date = argv[++index];
    else if (arg === "--output-root") options.outputRoot = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if ([options.publish, options.dryRun, options.reconcile].filter(Boolean).length > 1) {
    throw new Error("Choose one of --publish, --dry-run, or --reconcile.");
  }
  if (!options.publish && !options.dryRun && !options.reconcile) options.dryRun = true;
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

async function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function normalizePublishedText(value) {
  return String(value ?? "")
    .replaceAll("\r\n", "\n")
    .trim();
}

export function publishedTextMatches(expected, actual) {
  return normalizePublishedText(expected) === normalizePublishedText(actual);
}

export function publishedAssetsMatch(expectedAssets = [], actualAssets = []) {
  const expected = expectedAssets
    .map((asset) => asset.publicUrl)
    .filter(Boolean)
    .sort();
  const actual = actualAssets
    .map((asset) => asset.source)
    .filter(Boolean)
    .sort();
  return (
    expected.length === actual.length &&
    expected.every((url, index) => url === actual[index])
  );
}

export function isTerminalPublicationState(state) {
  return [
    "queued",
    "published",
    "publishing",
    "uncertain",
    "caption_hold",
    "external_existing",
  ].includes(state);
}

function bufferConfig() {
  return {
    xTransport:
      process.env.BIP_X_TRANSPORT?.trim().toLowerCase() || "brave",
    apiKey: process.env.BUFFER_API_KEY?.trim(),
    organizationId: process.env.BUFFER_ORGANIZATION_ID?.trim(),
    channelIds: {
      X: process.env.BUFFER_X_CHANNEL_ID?.trim(),
      LinkedIn: process.env.BUFFER_LINKEDIN_CHANNEL_ID?.trim(),
    },
    mediaBaseUrl: process.env.BIP_MEDIA_BASE_URL?.replace(/\/+$/, ""),
    mediaPublicDir: process.env.BIP_MEDIA_PUBLIC_DIR?.trim(),
    deployCommand: process.env.BIP_MEDIA_DEPLOY_COMMAND_JSON?.trim(),
    publishTimes: {
      "X-progress":
        process.env.BIP_X_PROGRESS_PUBLISH_TIME?.trim() || "14:30",
      "X-builder-note":
        process.env.BIP_X_PUBLISH_TIME?.trim() || "18:00",
      LinkedIn:
        process.env.BIP_LINKEDIN_PUBLISH_TIME?.trim() || "18:15",
    },
  };
}

export function selectPublishableAssets(assets = []) {
  const media = assets.filter((asset) =>
    ["image", "video"].includes(asset.kind),
  );
  const videos = media.filter(
    (asset) =>
      asset.kind === "video" &&
      !/(^|[/_-])(raw|rejected)([/_.-]|$)/i.test(asset.path),
  );
  if (videos.length) {
    return [
      videos.find((asset) => /final|reviewed/i.test(asset.path)) ??
        videos.at(-1),
    ];
  }
  const preferredImages = media.filter(
    (asset) =>
      asset.kind === "image" &&
      /story|diagram|contact|final|reviewed/i.test(asset.path),
  );
  return (preferredImages.length ? preferredImages : media).slice(0, 4);
}

function mediaRelativePath(day, asset) {
  return path.posix.join(
    day.id,
    asset.sha256,
    path.basename(asset.path),
  );
}

function publicUrl(baseUrl, relativePath) {
  return `${baseUrl}/${relativePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function stageMedia(day, assets, config) {
  if (!assets.length) return [];
  if (!config.mediaBaseUrl) {
    throw new Error(
      "BIP_MEDIA_BASE_URL is required for Buffer media attachments.",
    );
  }

  const staged = [];
  for (const asset of assets) {
    const source = path.join(ROOT, asset.path);
    const actualHash = await sha256File(source);
    if (actualHash !== asset.sha256) {
      throw new Error(`Local asset hash changed: ${asset.path}`);
    }
    const relativePath = mediaRelativePath(day, asset);
    if (config.mediaPublicDir) {
      const target = path.join(config.mediaPublicDir, ...relativePath.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      if ((await sha256File(target)) !== asset.sha256) {
        throw new Error(`Staged asset hash mismatch: ${target}`);
      }
    }
    staged.push({
      ...asset,
      relativePath,
      publicUrl: publicUrl(config.mediaBaseUrl, relativePath),
    });
  }

  if (config.deployCommand) {
    let command;
    try {
      command = JSON.parse(config.deployCommand);
    } catch {
      throw new Error("BIP_MEDIA_DEPLOY_COMMAND_JSON must be a JSON array.");
    }
    if (!Array.isArray(command) || !command.length) {
      throw new Error("BIP_MEDIA_DEPLOY_COMMAND_JSON must name a command.");
    }
    const result = spawnSync(command[0], command.slice(1), {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        BIP_MEDIA_DAY_ID: day.id,
        BIP_MEDIA_STAGED_DIR: config.mediaPublicDir ?? "",
      },
    });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "").trim();
      throw new Error(`Media deployment failed${detail ? `: ${detail}` : ""}`);
    }
  }

  for (const asset of staged) {
    const response = await fetch(asset.publicUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `Hosted media is unavailable (${response.status}): ${asset.publicUrl}`,
      );
    }
    const remoteHash = createHash("sha256")
      .update(Buffer.from(await response.arrayBuffer()))
      .digest("hex");
    if (remoteHash !== asset.sha256) {
      throw new Error(`Hosted media hash mismatch: ${asset.publicUrl}`);
    }
  }
  return staged;
}

function bufferAssets(assets) {
  return assets.map((asset) =>
    asset.kind === "video"
      ? { video: { url: asset.publicUrl } }
      : { image: { url: asset.publicUrl } },
  );
}

async function bufferGraphql({ apiKey, query, variables, operation }) {
  let response;
  try {
    response = await fetch(BUFFER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    const uncertain = new Error(
      `${operation} ended without a response: ${error instanceof Error ? error.message : error}`,
    );
    uncertain.uncertain = true;
    throw uncertain;
  }

  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`${operation} returned HTTP ${response.status}: ${body}`);
    error.uncertain = response.status >= 500;
    throw error;
  }
  const payload = JSON.parse(body);
  if (payload.errors?.length) {
    throw new Error(
      `${operation} GraphQL error: ${payload.errors.map((item) => item.message).join(" | ")}`,
    );
  }
  return payload.data;
}

async function getBufferChannel({ apiKey, channelId }) {
  const data = await bufferGraphql({
    apiKey,
    operation: "Buffer channel read-back",
    query: `
      query GetChannel($input: ChannelInput!) {
        channel(input: $input) {
          id
          name
          service
          timezone
          organizationId
          isDisconnected
          isLocked
        }
      }
    `,
    variables: { input: { id: channelId } },
  });
  if (!data?.channel?.id) throw new Error("Buffer channel read-back returned no channel.");
  return data.channel;
}

async function getBufferPost({ apiKey, postId }) {
  const data = await bufferGraphql({
    apiKey,
    operation: "Buffer post read-back",
    query: `
      query GetPost($input: PostInput!) {
        post(input: $input) {
          id
          text
          dueAt
          status
          channelId
          externalLink
          assets { id mimeType source }
        }
      }
    `,
    variables: { input: { id: postId } },
  });
  if (!data?.post?.id) throw new Error("Buffer post read-back returned no post.");
  return data.post;
}

async function getBufferPostWithRetry({ apiKey, postId, attempts = 3 }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await getBufferPost({ apiKey, postId });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw lastError;
}

async function holdBufferPostAsDraft({ apiKey, postId, text, assets }) {
  const data = await bufferGraphql({
    apiKey,
    operation: "Buffer caption safety hold",
    query: `
      mutation HoldPost($input: EditPostInput!) {
        editPost(input: $input) {
          ... on PostActionSuccess {
            post { id text dueAt status channelId externalLink }
          }
          ... on MutationError { message }
        }
      }
    `,
    variables: {
      input: {
        id: postId,
        text,
        ...(assets ? { assets } : {}),
        saveToDraft: true,
      },
    },
  });
  const result = data?.editPost;
  if (!result?.post?.id) {
    throw new Error(`Buffer could not hold the post as a draft: ${result?.message ?? "unknown error"}`);
  }
  return result.post;
}

async function createBufferPost({ apiKey, input }) {
  const data = await bufferGraphql({
    apiKey,
    operation: "Buffer create post",
    query: `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            text
            dueAt
            status
            channelId
            externalLink
            assets { id mimeType }
          }
        }
        ... on MutationError { message }
      }
    }
    `,
    variables: { input },
  });
  const result = data?.createPost;
  if (!result?.post?.id) {
    throw new Error(`Buffer rejected the post: ${result?.message ?? "unknown error"}`);
  }
  return result.post;
}

function validateBufferChannel({ platform, channel, organizationId }) {
  const expectedService = platform === "X" ? "twitter" : "linkedin";
  if (channel.id == null) throw new Error(`${platform} channel has no ID.`);
  if (channel.organizationId !== organizationId) {
    throw new Error(`${platform} channel does not belong to BUFFER_ORGANIZATION_ID.`);
  }
  if (channel.service !== expectedService) {
    throw new Error(
      `${platform} channel is service ${channel.service}; expected ${expectedService}.`,
    );
  }
  if (channel.isDisconnected) throw new Error(`${platform} channel is disconnected.`);
  if (channel.isLocked) throw new Error(`${platform} channel is locked.`);
}

export function validateText(platform, text) {
  if (!text?.trim()) throw new Error(`${platform} draft is missing.`);
  if (platform === "X" && [...text].length > 280) {
    throw new Error(`X draft is ${[...text].length} characters; limit is 280.`);
  }
  if (platform === "X") {
    for (const tag of ["#Shipaton", "#BuildInPublic"]) {
      if (!text.includes(tag)) throw new Error(`X draft is missing ${tag}.`);
    }
    const hashtags = [
      ...text.matchAll(/(^|\s)(#[\p{L}\p{N}_]+)/gu),
    ].map((match) => match[2].toLowerCase());
    const uniqueHashtags = new Set(hashtags);
    if (uniqueHashtags.size < 3 || uniqueHashtags.size > 5) {
      throw new Error(
        `X draft must use 3–5 unique relevant hashtags; found ${uniqueHashtags.size}.`,
      );
    }
  }
}

function draftForTarget(receipt, target) {
  const platformDraft = receipt.drafts?.[target.platform];
  if (target.platform !== "X") return platformDraft?.text;
  return (
    platformDraft?.posts?.find((post) => post.id === target.draftId)?.text ??
    (target.draftId === "progress" ? platformDraft?.text : null)
  );
}

function assetsForTarget(receipt, target, selectedAssets) {
  if (target.platform !== "X") return selectedAssets;
  const post = receipt.drafts?.X?.posts?.find(
    (candidate) => candidate.id === target.draftId,
  );
  if (!post?.assetSha256s?.length) return selectedAssets;
  const requested = new Set(post.assetSha256s);
  return selectedAssets.filter((asset) => requested.has(asset.sha256));
}

async function writeManifest(file, manifest) {
  manifest.updatedAt = new Date().toISOString();
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const day = resolveCampaignDay({ id: options.day, date: options.date });
  if (!day) {
    throw new Error(
      `No campaign day exists for ${options.day ?? options.date ?? "today"}.`,
    );
  }

  const outputRoot = path.resolve(options.outputRoot ?? GENERATED_ROOT);
  const latestPath = path.join(outputRoot, day.id, "latest.json");
  if (!(await exists(latestPath))) {
    throw new Error(`No generated receipt exists for ${day.id}.`);
  }
  const latest = await readJson(latestPath);
  const receiptPath = path.join(ROOT, latest.receipt);
  const receipt = await readJson(receiptPath);
  if (receipt.status !== "ready") {
    throw new Error(
      `${day.id} is ${receipt.status}; missing proof: ${(receipt.missingEvidence ?? []).join(" | ") || "unknown"}`,
    );
  }
  if (receipt.day?.date !== day.date || receipt.day?.id !== day.id) {
    throw new Error(`Latest receipt does not belong to ${day.id} ${day.date}.`);
  }

  for (const asset of receipt.assets ?? []) {
    const file = path.join(ROOT, asset.path);
    if ((await sha256File(file)) !== asset.sha256) {
      throw new Error(`Receipt asset hash mismatch: ${asset.path}`);
    }
  }

  const runDir = path.dirname(receiptPath);
  const manifestPath = path.join(runDir, "publication.json");
  const existing = (await exists(manifestPath))
    ? await readJson(manifestPath)
    : null;
  const config = bufferConfig();
  const targets = automaticPublishingTargets(day.date, config.publishTimes, {
    xTransport: config.xTransport,
  });
  const selectedAssets = selectPublishableAssets(receipt.assets ?? []);
  const receiptHash = await sha256File(receiptPath);
  const manifest = existing ?? {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    day: { id: day.id, date: day.date, title: day.title },
    sourceReceipt: path.relative(ROOT, receiptPath),
    sourceReceiptSha256: receiptHash,
    transport: "buffer",
    targets: {},
  };
  if (manifest.sourceReceiptSha256 !== receiptHash) {
    throw new Error(
      "The source receipt changed after the publication manifest was created.",
    );
  }

  let stagedAssets = [];
  let mediaError = null;
  try {
    stagedAssets = options.reconcile
      ? []
      : options.dryRun
      ? selectedAssets.map((asset) => ({ ...asset, publicUrl: null }))
      : await stageMedia(day, selectedAssets, config);
  } catch (error) {
    mediaError = error instanceof Error ? error.message : String(error);
  }

  let blocked = false;
  for (const target of targets) {
    const { platform } = target;
    const targetKey = target.key;
    const prior = manifest.targets[targetKey];
    if (options.reconcile) {
      if (prior?.state === "external_existing") {
        process.stdout.write(
          `${platform}: external post already recorded (${prior.canonicalUrl ?? "no URL"}).\n`,
        );
        continue;
      }
      if (!prior?.providerPostId) {
        process.stdout.write(`${platform}: no provider post to reconcile.\n`);
        continue;
      }
      if (!config.apiKey) {
        blocked = true;
        process.stdout.write(`${platform}: RECONCILE BLOCKED — BUFFER_API_KEY is not configured.\n`);
        continue;
      }
      try {
        const readBack = await getBufferPostWithRetry({
          apiKey: config.apiKey,
          postId: prior.providerPostId,
        });
        const captionMatches = publishedTextMatches(prior.text, readBack.text);
        const channelMatches = readBack.channelId === prior.channelId;
        const assetsMatch = publishedAssetsMatch(
          prior.assets,
          readBack.assets,
        );
        const scheduleMatches =
          !readBack.dueAt || new Date(readBack.dueAt).toISOString() === prior.dueAt;
        if (!captionMatches || !channelMatches || !scheduleMatches || !assetsMatch) {
          if (readBack.status !== "sent") {
            const hold = await holdBufferPostAsDraft({
              apiKey: config.apiKey,
              postId: prior.providerPostId,
              text: prior.text,
            });
            manifest.targets[targetKey] = {
              ...prior,
              state: "caption_hold",
              providerStatus: hold.status ?? readBack.status ?? null,
              providerReadBack: readBack,
              captionVerified: false,
              safetyHoldAt: new Date().toISOString(),
              error: "Reconciliation found a caption, channel, media, or schedule mismatch before delivery.",
            };
          } else {
            manifest.targets[targetKey] = {
              ...prior,
              state: "published_caption_mismatch",
              providerStatus: readBack.status,
              canonicalUrl: readBack.externalLink ?? prior.canonicalUrl ?? null,
              providerReadBack: readBack,
              captionVerified: false,
              reconciledAt: new Date().toISOString(),
              error: "The sent Buffer record does not exactly match the intended caption, channel, media, and schedule.",
            };
          }
          blocked = true;
          process.stdout.write(
            `${targetKey}: CAPTION MISMATCH ${prior.providerPostId} — ${manifest.targets[targetKey].state}\n`,
          );
        } else {
          manifest.targets[targetKey] = {
            ...prior,
            state: readBack.status === "sent" ? "published" : "queued",
            providerStatus: readBack.status,
            canonicalUrl: readBack.externalLink ?? prior.canonicalUrl ?? null,
            providerReadBack: readBack,
            captionVerified: true,
            captionVerifiedAt: new Date().toISOString(),
            reconciledAt: new Date().toISOString(),
          };
          process.stdout.write(
            `${targetKey}: RECONCILED ${manifest.targets[targetKey].state} ${prior.providerPostId}\n`,
          );
        }
      } catch (error) {
        blocked = true;
        manifest.targets[targetKey] = {
          ...prior,
          state: "uncertain",
          error: `Post-send reconciliation failed: ${error instanceof Error ? error.message : error}`,
        };
        process.stdout.write(`${targetKey}: RECONCILE UNCERTAIN — ${manifest.targets[targetKey].error}\n`);
      }
      await writeManifest(manifestPath, manifest);
      continue;
    }
    if (isTerminalPublicationState(prior?.state)) {
      process.stdout.write(`${platform}: ${prior.state} (${prior.providerPostId ?? "no id"})\n`);
      continue;
    }

    const draft = draftForTarget(receipt, target);
    const channelId = config.channelIds[platform];
    const targetSelectedAssets = assetsForTarget(
      receipt,
      target,
      selectedAssets,
    );
    const targetStagedAssets = assetsForTarget(
      receipt,
      target,
      stagedAssets,
    );
    const missing = [];
    try {
      validateText(platform, draft);
    } catch (error) {
      missing.push(error instanceof Error ? error.message : String(error));
    }
    if (!config.apiKey) missing.push("BUFFER_API_KEY is not configured.");
    if (!config.organizationId) {
      missing.push("BUFFER_ORGANIZATION_ID is not configured.");
    }
    if (!channelId) {
      missing.push(
        `${platform === "X" ? "BUFFER_X_CHANNEL_ID" : "BUFFER_LINKEDIN_CHANNEL_ID"} is not configured.`,
      );
    }
    if (platform === "X" && !targetSelectedAssets.length) {
      missing.push(
        `${targetKey} requires at least one verified screenshot, image, or video.`,
      );
    }
    if (selectedAssets.length && mediaError) missing.push(mediaError);

    let channelReadBack = null;
    if (options.publish && !missing.length) {
      try {
        channelReadBack = await getBufferChannel({
          apiKey: config.apiKey,
          channelId,
        });
        validateBufferChannel({
          platform,
          channel: channelReadBack,
          organizationId: config.organizationId,
        });
      } catch (error) {
        missing.push(error instanceof Error ? error.message : String(error));
      }
    }

    const dueAt = scheduledPublishInstant({
      date: day.date,
      time: target.localPublishTime,
      timeZone: CAMPAIGN.timezone,
    }).toISOString();
    const idempotencyKey = [
      "BIP",
      day.id,
      targetKey.toUpperCase().replaceAll(/[^A-Z0-9]/g, ""),
      sha256Text(`${receiptHash}:${draft}`).slice(0, 16),
    ].join("-");

    manifest.targets[targetKey] = {
      targetKey,
      platform,
      draftId: target.draftId,
      state: missing.length ? "blocked" : options.dryRun ? "dry_run_ready" : "publishing",
      idempotencyKey,
      channelId: channelId ?? null,
      dueAt,
      timeZone: CAMPAIGN.timezone,
      localPublishTime: target.localPublishTime,
      text: draft ?? null,
      textSha256: draft ? sha256Text(draft) : null,
      assets: (options.dryRun ? targetSelectedAssets : targetStagedAssets).map((asset) => ({
        path: asset.path,
        sha256: asset.sha256,
        kind: asset.kind,
        publicUrl: asset.publicUrl,
      })),
      missing,
      providerPostId: null,
      canonicalUrl: null,
      attemptedAt: options.publish && !missing.length ? new Date().toISOString() : null,
      channelReadBack,
    };
    await writeManifest(manifestPath, manifest);

    if (missing.length) {
      blocked = true;
      process.stdout.write(`${targetKey}: BLOCKED — ${missing.join(" | ")}\n`);
      continue;
    }
    if (options.dryRun) {
      process.stdout.write(`${targetKey}: DRY RUN READY for ${dueAt}\n`);
      continue;
    }

    let createdPostId = null;
    try {
      const post = await createBufferPost({
        apiKey: config.apiKey,
        input: {
          text: draft,
          channelId,
          schedulingType: "automatic",
          mode: "customScheduled",
          dueAt,
          ...(targetStagedAssets.length
            ? { assets: bufferAssets(targetStagedAssets) }
            : {}),
        },
      });
      createdPostId = post.id;
      const readBack = await getBufferPostWithRetry({
        apiKey: config.apiKey,
        postId: post.id,
      });
      const captionMatches = publishedTextMatches(draft, readBack.text);
      const scheduleMatches = new Date(readBack.dueAt).toISOString() === dueAt;
      const channelMatches = readBack.channelId === channelId;
      const assetsMatch = publishedAssetsMatch(
        targetStagedAssets,
        readBack.assets,
      );
      if (!captionMatches || !scheduleMatches || !channelMatches || !assetsMatch) {
        const hold = await holdBufferPostAsDraft({
          apiKey: config.apiKey,
          postId: post.id,
          text: draft,
          assets: bufferAssets(targetStagedAssets),
        });
        manifest.targets[targetKey] = {
          ...manifest.targets[targetKey],
          state: "caption_hold",
          providerPostId: post.id,
          providerStatus: hold.status ?? null,
          providerReadBack: readBack,
          captionVerified: false,
          safetyHoldAt: new Date().toISOString(),
          error: [
            captionMatches ? null : "Buffer read-back text did not match the exact caption.",
            scheduleMatches ? null : "Buffer read-back schedule did not match the Tbilisi-derived UTC instant.",
            channelMatches ? null : "Buffer read-back channel did not match the configured channel.",
            assetsMatch ? null : "Buffer read-back media did not match the verified hosted assets.",
          ].filter(Boolean).join(" "),
        };
        blocked = true;
        process.stdout.write(
            `${targetKey}: CAPTION HOLD ${post.id} — ${manifest.targets[targetKey].error}\n`,
          );
        await writeManifest(manifestPath, manifest);
        continue;
      }
      manifest.targets[targetKey] = {
        ...manifest.targets[targetKey],
        state: readBack.status === "sent" ? "published" : "queued",
        providerPostId: post.id,
        canonicalUrl: readBack.externalLink ?? null,
        providerStatus: readBack.status ?? null,
        providerCreateResponse: post,
        providerReadBack: readBack,
        captionVerified: true,
        captionVerifiedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      };
      process.stdout.write(`${targetKey}: QUEUED ${post.id} for ${dueAt}\n`);
    } catch (error) {
      blocked = true;
      const uncertain = Boolean(createdPostId || error?.uncertain);
      manifest.targets[targetKey] = {
        ...manifest.targets[targetKey],
        state: uncertain ? "uncertain" : "failed",
        providerPostId:
          createdPostId ?? manifest.targets[targetKey].providerPostId ?? null,
        error: error instanceof Error ? error.message : String(error),
      };
      process.stdout.write(
        `${targetKey}: ${uncertain ? "UNCERTAIN" : "FAILED"} — ${manifest.targets[targetKey].error}\n`,
      );
    }
    await writeManifest(manifestPath, manifest);
  }

  process.stdout.write(`Publication: ${path.relative(ROOT, manifestPath)}\n`);
  if (blocked && options.publish) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
