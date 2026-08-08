import {
  processSyncItems,
  retryDelayMs,
  sanitizeSyncError,
  sortSyncItems,
} from "./queue-policy";
import type { SyncQueueItem } from "./types";

function item(
  id: string,
  entityType: SyncQueueItem["entityType"],
  operation: SyncQueueItem["operation"] = "upsert",
  createdAt = 1,
): SyncQueueItem {
  return {
    id,
    ownerId: "owner-1",
    operation,
    entityType,
    entityId: id,
    payload: {},
    attempts: 0,
    availableAt: 0,
    createdAt,
    updatedAt: createdAt,
    lastError: null,
  };
}

describe("sync queue policy", () => {
  it("orders parent upserts before dependent records", () => {
    expect(
      sortSyncItems([
        item("relation", "artwork_tag"),
        item("art", "artwork"),
        item("child", "child_profile"),
        item("pad", "sketchpad"),
        item("adult", "adult_profile"),
        item("tag", "tag"),
      ]).map((entry) => entry.id),
    ).toEqual(["adult", "child", "pad", "art", "tag", "relation"]);
  });

  it("orders dependent deletes before parents", () => {
    expect(
      sortSyncItems([
        item("child", "child_profile", "delete"),
        item("pad", "sketchpad", "delete"),
        item("art", "artwork", "delete"),
        item("relation", "artwork_tag", "delete"),
      ]).map((entry) => entry.id),
    ).toEqual(["relation", "art", "pad", "child"]);
  });

  it("finishes upserts before processing queued deletes", () => {
    expect(
      sortSyncItems([
        item("old-art", "artwork", "delete", 1),
        item("new-pad", "sketchpad", "upsert", 2),
      ]).map((entry) => entry.id),
    ).toEqual(["new-pad", "old-art"]);
  });

  it("uses bounded exponential retry delays", () => {
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(4)).toBe(10 * 60_000);
    expect(retryDelayMs(99)).toBe(6 * 60 * 60_000);
  });

  it("redacts bearer tokens from persisted errors", () => {
    expect(sanitizeSyncError(new Error("Bearer abc.def-123 was rejected"))).toBe(
      "Bearer [redacted] was rejected",
    );
  });

  it("processes sequentially and stops at the first failure", async () => {
    const visited: string[] = [];
    const result = await processSyncItems(
      [item("art", "artwork"), item("child", "child_profile"), item("pad", "sketchpad")],
      async (entry) => {
        visited.push(entry.id);
        if (entry.id === "pad") throw new Error("stop");
      },
    );
    expect(visited).toEqual(["child", "pad"]);
    expect(result.completedIds).toEqual(["child"]);
    expect(result.failedItem?.id).toBe("pad");
  });
});
