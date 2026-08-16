import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAutomaticPublishingSchedule,
  automaticPublishingPlatforms,
  automaticPublishingTargets,
  isWeekendDate,
  scheduledPublishInstant,
} from "../scripts/build-in-public-distribution.mjs";
import {
  isTerminalPublicationState,
  publishedAssetsMatch,
  publishedTextMatches,
  selectPublishableAssets,
  validateText,
} from "../scripts/build-in-public-publish.mjs";
import { xDraftsFor } from "../scripts/build-in-public-capture.mjs";
import { DAYS } from "../scripts/build-in-public-plan.mjs";
import {
  canonicalRedditRules,
  findShipatonFlair,
  redditBodyFromDraft,
  redditPublishWindowOpen,
  redditRulesSha256,
} from "../scripts/build-in-public-publish-reddit.mjs";

test("weekend detection follows the campaign date", () => {
  assert.equal(isWeekendDate("2026-08-14"), false);
  assert.equal(isWeekendDate("2026-08-15"), true);
  assert.equal(isWeekendDate("2026-08-16"), true);
});

test("X is daily and LinkedIn is added only on weekends", () => {
  assert.deepEqual(automaticPublishingPlatforms("2026-08-14"), ["X"]);
  assert.deepEqual(automaticPublishingPlatforms("2026-08-15"), [
    "X",
    "LinkedIn",
  ]);
  assert.deepEqual(
    applyAutomaticPublishingSchedule("2026-08-15", [
      "LinkedIn",
      "Discord",
    ]),
    ["X", "LinkedIn", "Discord"],
  );
});

test("Buffer X publishing is disabled unless explicitly selected", () => {
  assert.deepEqual(automaticPublishingTargets("2026-08-14"), []);
  assert.deepEqual(
    automaticPublishingTargets("2026-08-14", {}, { xTransport: "buffer" }),
    [
    {
      key: "X-progress",
      platform: "X",
      draftId: "progress",
      localPublishTime: "14:30",
    },
    {
      key: "X-builder-note",
      platform: "X",
      draftId: "builder-note",
      localPublishTime: "18:00",
    },
    ],
  );
  assert.equal(
    automaticPublishingTargets("2026-08-15").at(-1).platform,
    "LinkedIn",
  );
});

test("every campaign day has two distinct media-required X drafts", () => {
  for (const day of DAYS) {
    const posts = xDraftsFor(day);
    assert.equal(posts.length, 2, day.id);
    assert.notEqual(posts[0].text, posts[1].text, day.id);
    for (const post of posts) {
      assert.equal(post.mediaRequired, true, `${day.id} ${post.id}`);
      assert.doesNotThrow(
        () => validateText("X", post.text),
        `${day.id} ${post.id}`,
      );
    }
  }
});

test("18:00 Tbilisi resolves to 14:00 UTC", () => {
  const instant = scheduledPublishInstant({
    date: "2026-08-15",
    time: "18:00",
    now: new Date("2026-08-15T08:00:00.000Z"),
  });
  assert.equal(instant.toISOString(), "2026-08-15T14:00:00.000Z");
});

test("past publishing slots move forward instead of backdating", () => {
  const instant = scheduledPublishInstant({
    date: "2026-08-14",
    time: "18:00",
    now: new Date("2026-08-14T15:30:00.000Z"),
  });
  assert.equal(instant.toISOString(), "2026-08-14T15:40:00.000Z");
});

test("publisher excludes raw video and prefers the reviewed take", () => {
  const assets = [
    { kind: "video", path: "captures/raw-demo.mp4" },
    { kind: "video", path: "captures/rejected-demo.mp4" },
    { kind: "video", path: "captures/reviewed-demo.mp4" },
    { kind: "image", path: "captures/story.png" },
  ];
  assert.deepEqual(selectPublishableAssets(assets), [assets[2]]);
});

test("publisher prefers composed images and limits carousels to four", () => {
  const assets = [
    { kind: "image", path: "captures/source-1.png" },
    { kind: "image", path: "captures/story.png" },
    { kind: "image", path: "captures/diagram.png" },
    { kind: "image", path: "captures/contact-sheet.png" },
    { kind: "image", path: "captures/final-card.png" },
    { kind: "image", path: "captures/reviewed-card.png" },
  ];
  assert.deepEqual(selectPublishableAssets(assets), assets.slice(1, 5));
});

test("Buffer caption verification tolerates line endings but never blank text", () => {
  assert.equal(publishedTextMatches("Hello\n\nWorld", "Hello\r\n\r\nWorld\n"), true);
  assert.equal(publishedTextMatches("Hello", ""), false);
});

test("Buffer media verification requires the exact hosted sources", () => {
  assert.equal(
    publishedAssetsMatch(
      [{ publicUrl: "https://media.example/D05/a.png" }],
      [{ source: "https://media.example/D05/a.png" }],
    ),
    true,
  );
  assert.equal(
    publishedAssetsMatch(
      [{ publicUrl: "https://media.example/D05/a.png" }],
      [{ source: "https://media.example/D05/b.png" }],
    ),
    false,
  );
});

test("an externally verified post is terminal and cannot be duplicated", () => {
  assert.equal(isTerminalPublicationState("external_existing"), true);
  assert.equal(isTerminalPublicationState("blocked"), false);
  assert.equal(isTerminalPublicationState("failed"), false);
});

test("Reddit body removes the duplicated headline and keeps the discussion", () => {
  assert.equal(
    redditBodyFromDraft(
      "How forgiving should a scanner be?\n\nI am testing capture failures.\n\nWhich failure matters first?",
      "How forgiving should a scanner be?",
    ),
    "I am testing capture failures.\n\nWhich failure matters first?",
  );
});

test("Reddit rules hash is stable when API order changes", () => {
  const first = {
    rules: [
      { short_name: "Promotion", kind: "all", description: "No spam" },
      { short_name: "Be useful", kind: "all", description: "Add context" },
    ],
  };
  const second = { rules: [...first.rules].reverse() };
  assert.equal(canonicalRedditRules(first), canonicalRedditRules(second));
  assert.equal(redditRulesSha256(first), redditRulesSha256(second));
});

test("Reddit requires one unambiguous Shipaton flair", () => {
  assert.deepEqual(
    findShipatonFlair([
      { id: "1", text: "Feedback" },
      { id: "2", text: "Shipaton 2026" },
    ]),
    { id: "2", text: "Shipaton 2026" },
  );
  assert.equal(
    findShipatonFlair([
      { id: "1", text: "Shipaton" },
      { id: "2", text: "Shipaton update" },
    ]),
    null,
  );
});

test("Reddit publishing opens at 18:30 Tbilisi time", () => {
  assert.equal(
    redditPublishWindowOpen({
      date: "2026-08-20",
      now: new Date("2026-08-20T14:29:00.000Z"),
    }),
    false,
  );
  assert.equal(
    redditPublishWindowOpen({
      date: "2026-08-20",
      now: new Date("2026-08-20T14:30:00.000Z"),
    }),
    true,
  );
});
