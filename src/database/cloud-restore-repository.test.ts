const mockEnqueue = jest.fn();
const mockDeletedFiles: string[] = [];

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get exists() {
      return true;
    }

    delete() {
      mockDeletedFiles.push(this.uri);
    }
  },
}));

jest.mock("./sync-repository", () => ({
  enqueueLocalSyncOperation: (...args: unknown[]) => mockEnqueue(...args),
}));

import { artworkTagEntityId } from "./sync-serialization";
import type { RemoteCloudSnapshot } from "@/sync/cloud-types";
import {
  applyRemoteCloudSnapshot,
  CloudRestoreCollisionError,
  reconcileLocalTagIdentity,
  remapQueuedTagReferences,
} from "./cloud-restore-repository";

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

  it("replaces a conflicting local tag while preserving artwork relations", async () => {
    const oldEntityId = artworkTagEntityId("art-a", "local-tag");
    const tx = {
      getFirstAsync: jest
        .fn()
        .mockResolvedValueOnce({
          name: "Qa",
          normalized_name: "qa",
          created_at: 1,
          updated_at: 2,
        })
        .mockResolvedValueOnce(null),
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([{
          operation: "upsert",
          entity_id: oldEntityId,
          payload: JSON.stringify({
            owner_id: "adult-a",
            artwork_id: "art-a",
            tag_id: "local-tag",
          }),
          updated_at: 10,
        }])
        .mockResolvedValueOnce([{ artwork_id: "art-a", created_at: 3 }]),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn(
        async (operation: (database: typeof tx) => Promise<void>) =>
          operation(tx),
      ),
    };

    await reconcileLocalTagIdentity(
      db as never,
      "adult-a",
      "local-tag",
      {
        id: "remote-tag",
        name: "Qa",
        normalizedName: "qa",
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-19T00:00:00.000Z",
      },
    );

    expect(tx.runAsync).toHaveBeenCalledWith(
      "DELETE FROM tags WHERE owner_id = ? AND id = ?",
      "adult-a",
      "local-tag",
    );
    expect(tx.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tags"),
      "remote-tag",
      "adult-a",
      "Qa",
      "qa",
      expect.any(Number),
      expect.any(Number),
    );
    expect(tx.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR IGNORE INTO artwork_tags"),
      "art-a",
      "remote-tag",
      3,
    );
    expect(mockEnqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        entityType: "artwork_tag",
        entityId: artworkTagEntityId("art-a", "remote-tag"),
      }),
    );
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

describe("cloud restore account isolation", () => {
  beforeEach(() => {
    mockDeletedFiles.length = 0;
  });

  it("rejects a remote parent ID owned by another local account before any write", async () => {
    const transaction = {
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("FROM child_profiles") && sql.includes("owner_id IS NULL")) {
          return [{ id: "shared-child" }];
        }
        return [];
      }),
      getFirstAsync: jest.fn(),
      runAsync: jest.fn(),
    };
    const db = {
      getAllAsync: jest.fn(async () => []),
      withExclusiveTransactionAsync: jest.fn(
        async (operation: (tx: typeof transaction) => Promise<void>) => operation(transaction),
      ),
    };
    const snapshot: RemoteCloudSnapshot = {
      adult: null,
      children: [],
      sketchpads: [{
        owner_id: "adult-a",
        id: "pad-a",
        child_id: "shared-child",
        name: "Cloud pad",
        style: "spread",
        design: "sunshine",
        border: "none",
        decoration: "none",
        cover_color: "#FFD65A",
        page_color: "#FFFDF4",
        sort_order: 0,
        created_at: "2026-08-09T00:00:00.000Z",
        updated_at: "2026-08-09T00:00:00.000Z",
        server_updated_at: "2026-08-09T00:00:00.000Z",
        deleted_at: null,
      }],
      artworks: [],
      tags: [],
      artworkTags: [],
      mediaFiles: [{
        owner_id: "adult-a",
        id: "orphan-media",
        artwork_id: "missing-artwork",
        kind: "preview",
        storage_path: "adult-a/preview.png",
        checksum: "a".repeat(64),
        byte_size: 10,
        mime_type: "image/png",
        upload_state: "uploaded",
        created_at: "2026-08-09T00:00:00.000Z",
        updated_at: "2026-08-09T00:00:00.000Z",
        server_updated_at: "2026-08-09T00:00:00.000Z",
        deleted_at: null,
        local_uri: "file:///downloaded-preview.png",
      }],
      tombstones: [],
      cloudBytes: 10,
      cloudLimit: 2 * 1024 * 1024 * 1024,
      failedMediaCount: 0,
    };

    await expect(applyRemoteCloudSnapshot(db as never, "adult-a", snapshot)).rejects.toEqual(
      expect.objectContaining<Partial<CloudRestoreCollisionError>>({
        code: "cross_account_id_collision",
        table: "child_profiles",
      }),
    );

    expect(transaction.runAsync).not.toHaveBeenCalled();
    expect(mockDeletedFiles).toEqual(["file:///downloaded-preview.png"]);
  });
});
