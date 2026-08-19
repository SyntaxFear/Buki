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

  it("restarts after canonical identity reconciliation before stale items run", async () => {
    const tag = item("tag-local", "tag", "upsert", 1);
    const staleRelation = item("relation-local", "artwork_tag", "upsert", 2);
    const push = jest.fn(async (current: SyncQueueItem) =>
      current.entityType === "tag" ? { restartBatch: true } : undefined,
    );

    await expect(processSyncItems([staleRelation, tag], push)).resolves.toEqual({
      completedIds: [tag.id],
      failedItem: null,
      error: null,
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(tag);
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

  it("frees deleted cloud storage before processing new uploads", () => {
    expect(
      sortSyncItems([
        item("old-art", "artwork", "delete", 1),
        item("new-pad", "sketchpad", "upsert", 2),
      ]).map((entry) => entry.id),
    ).toEqual(["old-art", "new-pad"]);
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
