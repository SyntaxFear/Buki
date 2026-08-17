#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionMarkdown } from "./build-in-public-capture.mjs";
import { resolveCampaignDay } from "./build-in-public-plan.mjs";
import {
  selectPublishableAssets,
  validateText,
} from "./build-in-public-publish.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_ROOT = path.join(
  ROOT,
  "docs",
  "build-in-public-assets",
  "30-day",
  "generated",
);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--today") options.today = true;
    else if (arg === "--day") options.day = argv[++index];
    else if (arg === "--date") options.date = argv[++index];
    else if (arg === "--input") options.input = argv[++index];
    else if (arg === "--output-root") options.outputRoot = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.input) throw new Error("--input <copy.json> is required.");
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validatePosts(input, receipt) {
  if (input.dayId !== receipt.day.id || input.date !== receipt.day.date) {
    throw new Error(
      `Copy input belongs to ${input.dayId ?? "unknown"} ${input.date ?? "unknown"}; expected ${receipt.day.id} ${receipt.day.date}.`,
    );
  }
  if (!Array.isArray(input.posts) || input.posts.length !== 2) {
    throw new Error("Copy input must contain exactly two X posts.");
  }
  const expectedIds = ["progress", "builder-note"];
  const availableMedia = selectPublishableAssets(receipt.assets ?? []);
  if (!availableMedia.length) {
    throw new Error(
      "Two-post X publishing requires at least one verified screenshot, image, or video in the receipt.",
    );
  }
  const mediaByHash = new Map(
    availableMedia.map((asset) => [asset.sha256, asset]),
  );
  const posts = input.posts.map((post, index) => {
    if (post.id !== expectedIds[index]) {
      throw new Error(
        `Post ${index + 1} must use id ${expectedIds[index]}; received ${post.id ?? "missing"}.`,
      );
    }
    validateText("X", post.text);
    const assetSha256s = Array.isArray(post.assetSha256s)
      ? [...new Set(post.assetSha256s)]
      : [];
    for (const assetHash of assetSha256s) {
      if (!mediaByHash.has(assetHash)) {
        throw new Error(
          `${post.id} references an unverified or unavailable media hash: ${assetHash}`,
        );
      }
    }
    return {
      ...receipt.drafts.X.posts[index],
      id: post.id,
      text: post.text.trim(),
      mediaRequired: true,
      ...(assetSha256s.length ? { assetSha256s } : {}),
    };
  });
  if (posts[0].text === posts[1].text) {
    throw new Error("The two X posts must use distinct copy and angles.");
  }
  return posts;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const day = resolveCampaignDay({ id: options.day, date: options.date });
  if (!day) throw new Error("No campaign day exists for the requested date.");
  const outputRoot = path.resolve(options.outputRoot ?? GENERATED_ROOT);
  const latestPath = path.join(outputRoot, day.id, "latest.json");
  const latest = JSON.parse(await readFile(latestPath, "utf8"));
  const receiptPath = path.join(ROOT, latest.receipt);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  if (receipt.status !== "ready") {
    throw new Error(`${day.id} is ${receipt.status}; copy cannot be applied.`);
  }
  const publicationPath = path.join(path.dirname(receiptPath), "publication.json");
  if (await exists(publicationPath)) {
    throw new Error(
      "publication.json already exists. Refusing to change copy after publication tracking began.",
    );
  }
  const inputPath = path.resolve(options.input);
  const inputText = await readFile(inputPath, "utf8");
  const input = JSON.parse(inputText);
  const posts = validatePosts(input, receipt);
  receipt.drafts.X = {
    ...receipt.drafts.X,
    text: posts[0].text,
    posts,
  };
  receipt.copyReview = {
    appliedAt: new Date().toISOString(),
    channel: "X",
    method: "plainspoken",
    inputSha256: sha256(inputText),
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  const sessionPath = path.join(ROOT, latest.session);
  await writeFile(sessionPath, sessionMarkdown(receipt));
  process.stdout.write(
    `Applied two validated Plainspoken X posts to ${path.relative(ROOT, receiptPath)}.\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
