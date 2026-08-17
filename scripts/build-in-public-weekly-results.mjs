#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WEEKLY_X_CAMPAIGN } from "./build-in-public-weekly.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") options.manifest = argv[++index];
    else if (arg === "--approve") options.approval = argv[++index];
    else if (arg === "--record") options.results = argv[++index];
    else if (arg === "--verify") options.verification = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.manifest) throw new Error("--manifest <weekly-manifest.json> is required.");
  const modes = [options.approval, options.results, options.verification].filter(Boolean);
  if (modes.length !== 1)
    throw new Error("Choose exactly one of --approve, --record, or --verify.");
  return options;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeVisibleText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function readyPosts(manifest) {
  const readyDates = new Set(
    (manifest.days ?? []).filter((day) => day.status === "ready").map((day) => day.date),
  );
  return (manifest.posts ?? []).filter((post) => readyDates.has(post.date));
}

function assertBatch(manifest) {
  if (manifest.campaign?.account !== WEEKLY_X_CAMPAIGN.account)
    throw new Error(`Manifest account is not ${WEEKLY_X_CAMPAIGN.account}.`);
  const canonical = (manifest.posts ?? []).map((post) => ({
    id: post.id,
    date: post.date,
    slot: post.slot,
    scheduledLocalTime: post.scheduledLocalTime,
    text: post.text,
    mediaSha256: post.media?.sha256,
  }));
  const actual = sha256Text(JSON.stringify(canonical));
  if (actual !== manifest.batchSha256)
    throw new Error("The weekly batch changed after validation.");
}

export async function approve(manifestPath, manifest, approvalPath) {
  assertBatch(manifest);
  if (manifest.status !== "approval_required")
    throw new Error(`Manifest is ${manifest.status}; it cannot be approved.`);
  const approval = await readJson(path.resolve(approvalPath));
  if (approval.batchSha256 !== manifest.batchSha256)
    throw new Error("Approval does not match the validated weekly batch.");
  const expectedIds = readyPosts(manifest).map((post) => post.id).sort();
  const approvedIds = [...new Set(approval.postIds ?? [])].sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(approvedIds))
    throw new Error("Approval must name every ready post and no held post.");
  if (approval.account !== WEEKLY_X_CAMPAIGN.account)
    throw new Error(`Approval must name ${WEEKLY_X_CAMPAIGN.account}.`);
  manifest.approval = {
    confirmedAt: approval.confirmedAt ?? new Date().toISOString(),
    confirmedBy: "user-action-time-confirmation",
    account: approval.account,
    postIds: approvedIds,
    batchSha256: approval.batchSha256,
  };
  manifest.status = "approved_for_brave_scheduling";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Approved ${approvedIds.length} posts for ${approval.account}.\n`);
}

function resultMismatch(post, result) {
  const errors = [];
  if (result.account !== WEEKLY_X_CAMPAIGN.account)
    errors.push(`Account is ${result.account ?? "missing"}.`);
  if (normalizeVisibleText(result.visibleText) !== normalizeVisibleText(post.text))
    errors.push("Visible caption does not match.");
  if (result.date !== post.date) errors.push("Scheduled date does not match.");
  if (result.scheduledLocalTime !== post.scheduledLocalTime)
    errors.push("Scheduled time does not match.");
  if (
    String(result.mediaSha256 ?? "").toLowerCase() !==
    String(post.media?.sha256 ?? "").toLowerCase()
  )
    errors.push("Visible media does not match the verified hash.");
  return errors;
}

export async function recordResults(manifestPath, manifest, resultsPath) {
  assertBatch(manifest);
  if (manifest.status !== "approved_for_brave_scheduling" && manifest.status !== "partially_scheduled")
    throw new Error(`Manifest is ${manifest.status}; scheduling results cannot be recorded.`);
  if (!manifest.approval?.confirmedAt)
    throw new Error("Action-time approval is missing.");
  const payload = await readJson(path.resolve(resultsPath));
  if (payload.batchSha256 !== manifest.batchSha256)
    throw new Error("Scheduling results do not match the approved batch.");
  if (payload.account !== WEEKLY_X_CAMPAIGN.account)
    throw new Error(`Scheduling results must name ${WEEKLY_X_CAMPAIGN.account}.`);
  const posts = new Map(readyPosts(manifest).map((post) => [post.id, post]));
  const prior = new Map((manifest.schedulingResults ?? []).map((item) => [item.postId, item]));
  let stopSeen = false;
  for (const result of payload.results ?? []) {
    if (stopSeen) throw new Error("Results appear after an uncertain or mismatched browser action.");
    const post = posts.get(result.postId);
    if (!post) throw new Error(`Unknown or held post result: ${result.postId}.`);
    if (prior.has(result.postId))
      throw new Error(`Result already exists for ${result.postId}; automatic retry is forbidden.`);
    if (!new Set(["scheduled", "skipped_past", "uncertain", "failed"]).has(result.state))
      throw new Error(`Unsupported scheduling state: ${result.state}.`);
    const mismatch = result.state === "scheduled" ? resultMismatch(post, result) : [];
    const state = mismatch.length ? "mismatch" : result.state;
    prior.set(result.postId, {
      postId: result.postId,
      state,
      attemptedAt: result.attemptedAt ?? new Date().toISOString(),
      account: result.account,
      date: result.date,
      scheduledLocalTime: result.scheduledLocalTime,
      visibleText: result.visibleText ?? null,
      mediaSha256: result.mediaSha256 ?? null,
      scheduledListEvidence: result.scheduledListEvidence ?? null,
      error: mismatch.join(" ") || result.error || null,
    });
    if (["uncertain", "mismatch"].includes(state)) stopSeen = true;
  }
  manifest.schedulingResults = [...prior.values()];
  manifest.externalActionPerformed = manifest.schedulingResults.some(
    (result) => result.state === "scheduled",
  );
  const approvedIds = new Set(manifest.approval.postIds);
  const recordedIds = new Set(manifest.schedulingResults.map((result) => result.postId));
  const hasStop = manifest.schedulingResults.some((result) =>
    ["uncertain", "mismatch"].includes(result.state),
  );
  manifest.status = hasStop
    ? "scheduling_stopped"
    : [...approvedIds].every((id) => recordedIds.has(id))
      ? "scheduled"
      : "partially_scheduled";
  manifest.schedulingUpdatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${manifest.status.toUpperCase()} ${manifest.weekStart}\n`);
}

export async function recordVerification(manifestPath, manifest, verificationPath) {
  assertBatch(manifest);
  const payload = await readJson(path.resolve(verificationPath));
  if (payload.batchSha256 !== manifest.batchSha256)
    throw new Error("Verification does not match the weekly batch.");
  if (payload.account !== WEEKLY_X_CAMPAIGN.account)
    throw new Error(`Verification must name ${WEEKLY_X_CAMPAIGN.account}.`);
  const scheduled = new Map(
    (manifest.schedulingResults ?? [])
      .filter((result) => result.state === "scheduled")
      .map((result) => [result.postId, result]),
  );
  const verifications = new Map(
    (manifest.deliveryVerifications ?? []).map((item) => [item.postId, item]),
  );
  for (const item of payload.results ?? []) {
    if (!scheduled.has(item.postId))
      throw new Error(`Cannot verify a post that was not recorded as scheduled: ${item.postId}.`);
    if (!new Set(["published", "missing", "mismatch", "unknown"]).has(item.state))
      throw new Error(`Unsupported verification state: ${item.state}.`);
    verifications.set(item.postId, {
      postId: item.postId,
      state: item.state,
      checkedAt: item.checkedAt ?? new Date().toISOString(),
      canonicalUrl: item.canonicalUrl ?? null,
      visibleText: item.visibleText ?? null,
      visibleMediaMatched: item.visibleMediaMatched ?? null,
      error: item.error ?? null,
      action: "notify_only",
    });
  }
  manifest.deliveryVerifications = [...verifications.values()];
  manifest.lastVerifiedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Recorded ${payload.results?.length ?? 0} read-only delivery checks.\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const manifest = await readJson(manifestPath);
  if (options.approval) await approve(manifestPath, manifest, options.approval);
  else if (options.results) await recordResults(manifestPath, manifest, options.results);
  else await recordVerification(manifestPath, manifest, options.verification);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
