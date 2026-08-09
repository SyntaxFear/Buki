const mockEnqueue = jest.fn();

jest.mock("expo-file-system", () => ({
  File: class MockFile {},
}));

jest.mock("./sync-repository", () => ({
  enqueueLocalSyncOperation: (...args: unknown[]) => mockEnqueue(...args),
}));

import { artworkTagEntityId } from "./sync-serialization";
import { remapQueuedTagReferences } from "./cloud-restore-repository";

interface QueueRow {
  operation: string;
  entity_id: string;
  payload: string | null;
  updated_at: number;
}

function database(rows: QueueRow[]) {
  return {
    getAllAsync: jest.fn().mockResolvedValue(rows),
    runAsync: jest.fn().mockResolvedValue(undefined),
  };
}

describe("cloud restore tag queue reconciliation", () => {
  beforeEach(() => {
    mockEnqueue.mockReset();
    mockEnqueue.mockResolvedValue(undefined);
  });

  it("moves pending relations from a conflicting local tag to the server tag", async () => {
    const oldEntityId = artworkTagEntityId("art|one", "local tag");
    const db = database([{
      operation: "upsert",
      entity_id: oldEntityId,
      payload: JSON.stringify({
        owner_id: "adult-a",
        artwork_id: "art|one",
        tag_id: "local tag",
        created_at: "2026-08-09T00:00:00.000Z",
      }),
      updated_at: 10,
    }]);

    const result = await remapQueuedTagReferences(
      db as never,
      "adult-a",
      "local tag",
      "remote tag",
    );
    const canonicalEntityId = artworkTagEntityId("art|one", "remote tag");

    expect(db.runAsync).toHaveBeenCalledWith(
      "DELETE FROM sync_queue WHERE owner_id = ? AND entity_type = 'tag' AND entity_id = ?",
      "adult-a",
      "local tag",
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("entity_type = 'artwork_tag'"),
      "adult-a",
      oldEntityId,
    );
    expect(mockEnqueue).toHaveBeenCalledWith(db, expect.objectContaining({
      ownerId: "adult-a",
      operation: "upsert",
      entityType: "artwork_tag",
      entityId: canonicalEntityId,
      payload: expect.objectContaining({
        owner_id: "adult-a",
        artwork_id: "art|one",
        tag_id: "remote tag",
        created_at: "2026-08-09T00:00:00.000Z",
      }),
    }));
    expect(result).toEqual({
      removedKeys: [`tag:local tag`, `artwork_tag:${oldEntityId}`],
      queuedOperations: [{
        key: `artwork_tag:${canonicalEntityId}`,
        operation: "upsert",
      }],
    });
  });

  it("keeps a newer canonical relation operation during a remap collision", async () => {
    const oldEntityId = artworkTagEntityId("art-a", "local-tag");
    const canonicalEntityId = artworkTagEntityId("art-a", "remote-tag");
    const db = database([
      {
        operation: "upsert",
        entity_id: oldEntityId,
        payload: JSON.stringify({ artwork_id: "art-a", tag_id: "local-tag" }),
        updated_at: 10,
      },
      {
        operation: "delete",
        entity_id: canonicalEntityId,
        payload: JSON.stringify({ artwork_id: "art-a", tag_id: "remote-tag" }),
        updated_at: 20,
      },
    ]);

    const result = await remapQueuedTagReferences(
      db as never,
      "adult-a",
      "local-tag",
      "remote-tag",
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(result.queuedOperations).toEqual([]);
    expect(result.removedKeys).toContain(`artwork_tag:${oldEntityId}`);
  });

  it("preserves pending relation deletions under the canonical tag id", async () => {
    const oldEntityId = artworkTagEntityId("art-a", "local-tag");
    const db = database([{
      operation: "delete",
      entity_id: oldEntityId,
      payload: JSON.stringify({
        owner_id: "adult-a",
        artwork_id: "art-a",
        tag_id: "local-tag",
        deleted_at: "2026-08-09T01:00:00.000Z",
      }),
      updated_at: 10,
    }]);

    await remapQueuedTagReferences(db as never, "adult-a", "local-tag", "remote-tag");

    expect(mockEnqueue).toHaveBeenCalledWith(db, expect.objectContaining({
      operation: "delete",
      entityId: artworkTagEntityId("art-a", "remote-tag"),
      payload: expect.objectContaining({
        tag_id: "remote-tag",
        deleted_at: "2026-08-09T01:00:00.000Z",
      }),
    }));
  });

  it("ignores malformed or unrelated queued relation identifiers", async () => {
    const db = database([
      { operation: "upsert", entity_id: "missing-separator", payload: null, updated_at: 1 },
      {
        operation: "upsert",
        entity_id: artworkTagEntityId("art-a", "another-tag"),
        payload: null,
        updated_at: 2,
      },
    ]);

    const result = await remapQueuedTagReferences(
      db as never,
      "adult-a",
      "local-tag",
      "remote-tag",
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ removedKeys: ["tag:local-tag"], queuedOperations: [] });
  });
});
