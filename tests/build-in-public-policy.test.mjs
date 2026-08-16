import test from "node:test";
import assert from "node:assert/strict";
import { hashtagsFor, validatePlatformSet, validateSimulatorAuthorization } from "../scripts/build-in-public-policy.mjs";

test("simulator capture requires all three explicit controls", () => {
  assert.equal(validateSimulatorAuthorization({}).authorized, false);
  assert.equal(validateSimulatorAuthorization({ allowSimulator: true, disposableSimulator: true, simulatorId: "ABC" }).authorized, true);
});

test("excluded networks are detected", () => {
  assert.deepEqual(validatePlatformSet(["X", "Instagram", "TikTok"]), ["Instagram", "TikTok"]);
});

test("platform hashtags remain intentionally small", () => {
  assert.deepEqual(hashtagsFor("X"), [
    "#Shipaton",
    "#BuildInPublic",
    "#IndieDev",
  ]);
  assert.deepEqual(hashtagsFor("Reddit"), []);
});
