import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  WEEKLY_CATEGORY_QUOTAS,
  WEEKLY_X_CAMPAIGN,
  createWeeklyTemplate,
  nearDuplicateScore,
  scheduleForWeek,
  validateWeekStart,
  validateWeeklyPackage,
  weekDates,
} from "../scripts/build-in-public-weekly.mjs";
import {
  DISPOSABLE_SIMULATOR,
  verifyDisposableSimulator,
} from "../scripts/build-in-public-simulator.mjs";
import {
  approve,
  recordResults,
  recordVerification,
} from "../scripts/build-in-public-weekly-results.mjs";

const CATEGORIES = [
  "product-demo",
  "builder-process",
  "technical-lesson",
  "testing",
  "product-demo",
  "user-problem",
  "technical-lesson",
  "builder-process",
  "product-demo",
  "testing",
  "technical-lesson",
  "app-store-process",
  "product-demo",
  "weekly-reflection",
];

const UNIQUE_LINES = [
  "I recorded the page curl at normal speed so the pause is easier to judge.",
  "For me, the useful part of building in public is explaining one decision clearly.",
  "The cutout pipeline now has a visual checkpoint before artwork reaches the book.",
  "I tested the empty-library path because first-use screens usually hide the awkward cases.",
  "This capture shows how a paper boat lands inside a digital sketchpad.",
  "Parents do not need another camera roll folder. They need a simple way to keep the story.",
  "The image step I keep watching is the edge cleanup around light pencil marks.",
  "A weekly batch forces me to separate real progress from things that only sound like progress.",
  "I compared two sketchpad covers using the same synthetic artwork.",
  "The larger text-size pass exposed where the toolbar becomes crowded first.",
  "The export flow is designed around one rule: families should keep a portable copy.",
  "App Store review work is mostly careful preparation, screenshots, notes, and patient checking.",
  "This short clip follows one drawing from the demo camera into its saved page.",
  "I looked back at the week and the strongest posts were the ones with one honest point.",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function validPackage(weekStart = "2026-08-16") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buki-weekly-"));
  const template = createWeeklyTemplate(weekStart);
  const posts = [];
  for (const [index, slot] of template.posts.entries()) {
    const mediaPath = path.join(directory, `media-${index}.bin`);
    const contents = Buffer.from(`unique-media-${weekStart}-${index}`);
    await writeFile(mediaPath, contents);
    const question = index < 10 ? `Which detail would you test in example ${index}?` : null;
    const link = index < 2 ? WEEKLY_X_CAMPAIGN.landingPage : null;
    const hashtags = ["#Shipaton", "#BuildInPublic", `#Buki${index}`];
    const text = [
      UNIQUE_LINES[index],
      question,
      link,
      hashtags.join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");
    posts.push({
      ...slot,
      category: CATEGORIES[index],
      topic: `topic ${index}`,
      angle: `angle ${index}`,
      hook: `hook ${index}`,
      text,
      question,
      hashtags,
      link,
      freshEvidence: true,
      evidenceSources: [`source-${index}`],
      media: {
        kind: index < 4 ? "video" : index < 10 ? "screenshot" : "card",
        path: mediaPath,
        sha256: sha256(contents),
        sourceType: index < 10 ? "simulator" : "evidence-card",
      },
    });
  }
  return { ...template, posts };
}

async function validManifest() {
  const input = await validPackage();
  const validation = await validateWeeklyPackage(input);
  const canonical = input.posts.map((post) => ({
    id: post.id,
    date: post.date,
    slot: post.slot,
    scheduledLocalTime: post.scheduledLocalTime,
    text: post.text,
    mediaSha256: post.media.sha256,
  }));
  return {
    ...input,
    status: "approval_required",
    days: validation.days,
    batchSha256: sha256(JSON.stringify(canonical)),
    approval: null,
    externalActionPerformed: false,
  };
}

test("weekly campaign accepts only complete Sunday-to-Saturday ranges", () => {
  assert.deepEqual(validateWeekStart("2026-08-16"), []);
  assert.deepEqual(validateWeekStart("2026-10-25"), []);
  assert.ok(validateWeekStart("2026-08-17").some((error) => error.includes("Sunday")));
  assert.ok(validateWeekStart("2026-11-01").length > 0);
  assert.deepEqual(weekDates("2026-10-25"), [
    "2026-10-25",
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
  ]);
});

test("weekly schedule has unique minutes and avoids the previous pattern", () => {
  const first = scheduleForWeek("2026-08-16");
  const previous = { posts: first };
  const second = scheduleForWeek("2026-08-23", previous);
  for (const slot of ["early", "late"]) {
    const current = first.filter((post) => post.slot === slot);
    assert.equal(new Set(current.map((post) => post.scheduledLocalTime)).size, 7);
    const next = second.filter((post) => post.slot === slot);
    for (let index = 0; index < 7; index += 1)
      assert.notEqual(next[index].scheduledLocalTime, current[index].scheduledLocalTime);
  }
});

test("a complete 14-post weekly package passes every gate", async () => {
  const input = await validPackage();
  const result = await validateWeeklyPackage(input);
  assert.equal(result.status, "approval_required");
  assert.deepEqual(result.globalErrors, []);
  assert.equal(result.days.every((day) => day.status === "ready"), true);
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(WEEKLY_CATEGORY_QUOTAS).map((category) => [
        category,
        input.posts.filter((post) => post.category === category).length,
      ]),
    ),
    WEEKLY_CATEGORY_QUOTAS,
  );
});

test("reused media and repeated copy hold only the affected day", async () => {
  const input = await validPackage();
  input.posts[1].media = { ...input.posts[0].media };
  input.posts[1].text = input.posts[0].text;
  input.posts[1].hook = input.posts[0].hook;
  input.posts[1].hashtags = input.posts[0].hashtags;
  const result = await validateWeeklyPackage(input);
  assert.equal(result.status, "approval_required");
  assert.equal(result.days[0].status, "held");
  assert.equal(result.days.slice(1).every((day) => day.status === "ready"), true);
});

test("history blocks repeated questions, topic angles, and media", async () => {
  const input = await validPackage();
  const history = [{ ...input.posts[0], id: "historic-post" }];
  const result = await validateWeeklyPackage(input, { history });
  assert.equal(result.days[0].status, "held");
  assert.ok(result.errorsByDate[input.posts[0].date].some((error) => error.includes("historic-post")));
});

test("returning to a feature needs fresh evidence and a new angle", async () => {
  const input = await validPackage();
  const historic = {
    ...input.posts[0],
    id: "older-feature-post",
    text: "I previously checked the Buki page turn. #Shipaton #BuildInPublic #OldAngle",
    hook: "older hook",
    question: null,
    hashtags: ["#Shipaton", "#BuildInPublic", "#OldAngle"],
    angle: "older angle",
    media: { ...input.posts[0].media, sha256: "f".repeat(64) },
  };
  const allowed = await validateWeeklyPackage(input, { history: [historic] });
  assert.equal(allowed.days[0].status, "ready");
  input.posts[0].freshEvidence = false;
  const blocked = await validateWeeklyPackage(input, { history: [historic] });
  assert.equal(blocked.days[0].status, "held");
});

test("metrics and unstable Apple status claims are blocked", async () => {
  const input = await validPackage();
  input.posts[0].text = input.posts[0].text.replace(
    UNIQUE_LINES[0],
    "Buki has 30+ downloads and is waiting for review.",
  );
  const result = await validateWeeklyPackage(input);
  assert.equal(result.days[0].status, "held");
  assert.ok(result.errorsByDate[input.posts[0].date].some((error) => error.includes("metrics")));
  assert.ok(result.errorsByDate[input.posts[0].date].some((error) => error.includes("App Store")));
});

test("near-duplicate scoring catches rewritten templates", () => {
  assert.ok(
    nearDuplicateScore(
      "I tested the Buki page curl today and the small delay changed the feeling.",
      "I tested the Buki page curl today and the tiny delay changed the feeling.",
    ) >= 0.72,
  );
  assert.ok(
    nearDuplicateScore(
      "I tested the page curl.",
      "Parents told me where paper drawings go after the fridge.",
    ) < 0.72,
  );
});

test("simulator reset is pinned to the named disposable device", async () => {
  assert.equal(DISPOSABLE_SIMULATOR.udid, "83382C8C-B573-44BB-8DB6-CBFD6E24E608");
  assert.match(DISPOSABLE_SIMULATOR.name, /Disposable/);
  const result = await verifyDisposableSimulator({});
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((error) => error.includes("app")));
  assert.ok(result.errors.some((error) => error.includes("seed")));
});

test("weekly template itself contains 14 ordered slots", async () => {
  const template = createWeeklyTemplate("2026-08-16");
  assert.equal(template.posts.length, 14);
  assert.equal(template.posts[0].id, "2026-08-16-early");
  assert.equal(template.posts.at(-1).id, "2026-08-22-late");
  assert.equal(JSON.parse(JSON.stringify(template)).campaign.transport, "brave-extension");
  assert.ok((await readFile(new URL("../scripts/build-in-public-weekly.mjs", import.meta.url), "utf8")).includes("approvalRequired"));
});

test("approval is batch-bound and scheduling read-back must match exactly", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buki-results-"));
  const manifestPath = path.join(directory, "manifest.json");
  const approvalPath = path.join(directory, "approval.json");
  const resultsPath = path.join(directory, "results.json");
  const manifest = await validManifest();
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(
    approvalPath,
    JSON.stringify({
      batchSha256: manifest.batchSha256,
      account: WEEKLY_X_CAMPAIGN.account,
      postIds: manifest.posts.map((post) => post.id),
    }),
  );
  await approve(manifestPath, manifest, approvalPath);
  const approved = JSON.parse(await readFile(manifestPath, "utf8"));
  const post = approved.posts[0];
  await writeFile(
    resultsPath,
    JSON.stringify({
      batchSha256: approved.batchSha256,
      account: WEEKLY_X_CAMPAIGN.account,
      results: [
        {
          postId: post.id,
          state: "scheduled",
          account: WEEKLY_X_CAMPAIGN.account,
          visibleText: post.text,
          date: post.date,
          scheduledLocalTime: post.scheduledLocalTime,
          mediaSha256: post.media.sha256,
        },
      ],
    }),
  );
  await recordResults(manifestPath, approved, resultsPath);
  const recorded = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(recorded.status, "partially_scheduled");
  assert.equal(recorded.schedulingResults[0].state, "scheduled");
});

test("daily verification records notify-only outcomes without publishing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buki-verify-"));
  const manifestPath = path.join(directory, "manifest.json");
  const verificationPath = path.join(directory, "verification.json");
  const manifest = await validManifest();
  const post = manifest.posts[0];
  manifest.status = "scheduled";
  manifest.approval = { confirmedAt: new Date().toISOString() };
  manifest.schedulingResults = [{ postId: post.id, state: "scheduled" }];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(
    verificationPath,
    JSON.stringify({
      batchSha256: manifest.batchSha256,
      account: WEEKLY_X_CAMPAIGN.account,
      results: [{ postId: post.id, state: "missing" }],
    }),
  );
  await recordVerification(manifestPath, manifest, verificationPath);
  const recorded = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(recorded.deliveryVerifications[0].action, "notify_only");
  assert.equal(recorded.externalActionPerformed, false);
});
