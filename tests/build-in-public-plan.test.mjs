import test from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN, DAYS, getDayByDate, getDayById, validateBuildInPublicPlan } from "../scripts/build-in-public-plan.mjs";

test("campaign has 30 valid consecutive scheduled days", () => {
  assert.equal(DAYS.length, 30);
  assert.deepEqual(validateBuildInPublicPlan(), []);
  assert.equal(DAYS[0].date, CAMPAIGN.startDate);
  assert.equal(DAYS.at(-1).date, CAMPAIGN.endDate);
});

test("TikTok and Instagram are excluded", () => {
  for (const item of DAYS) {
    assert.equal(item.platforms.includes("TikTok"), false);
    assert.equal(item.platforms.includes("Instagram"), false);
  }
});

test("days resolve by id and date", () => {
  assert.equal(getDayById("d01")?.date, "2026-08-11");
  assert.equal(getDayByDate("2026-09-09")?.id, "D30");
});

test("every day has one feedback question", () => {
  for (const item of DAYS) assert.ok(item.feedbackQuestion.length > 10, item.id);
});

test("X is daily and LinkedIn is weekend-only", () => {
  for (const item of DAYS) {
    const weekday = new Date(`${item.date}T12:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    assert.equal(item.platforms.includes("X"), true, item.id);
    assert.equal(item.platforms.includes("LinkedIn"), weekend, item.id);
  }
});
