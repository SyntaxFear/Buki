const mockFrom = jest.fn();
const mockReconcileTag = jest.fn();

jest.mock("@/auth/supabase", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

jest.mock("@/database", () => ({
  reconcileBukiTagIdentity: (...args: unknown[]) => mockReconcileTag(...args),
}));

jest.mock("./media-upload", () => ({
  deleteQueuedMedia: jest.fn(),
  uploadQueuedMedia: jest.fn(),
}));

import type { SyncQueueItem } from "./types";
import { pushRemoteSyncItem } from "./remote";

function tagItem(): SyncQueueItem {
  return {
    id: "queue-tag",
    ownerId: "owner-a",
    operation: "upsert",
    entityType: "tag",
    entityId: "local-tag",
    payload: {
      owner_id: "owner-a",
      id: "local-tag",
      name: "Qa",
      normalized_name: "qa",
      created_at: "2026-08-19T03:27:55.333Z",
      updated_at: "2026-08-19T03:27:55.333Z",
      deleted_at: null,
    },
    attempts: 3,
    availableAt: 0,
    createdAt: 1,
    updatedAt: 2,
    lastError: null,
  };
}

function lookupBuilder(data: unknown) {
  const builder = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(async () => ({ data, error: null })),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe("remote tag identity reconciliation", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockReconcileTag.mockReset().mockResolvedValue(undefined);
  });

  it("adopts the existing cloud tag and restarts before stale relations run", async () => {
    const remoteTag = {
      id: "remote-tag",
      name: "Qa",
      normalized_name: "qa",
      created_at: "2026-08-18T15:04:04.610Z",
      updated_at: "2026-08-18T15:04:04.610Z",
    };
    const lookup = lookupBuilder(remoteTag);
    const canonicalUpdateBuilder = {
      error: null,
      update: jest.fn(),
      eq: jest.fn(),
    };
    canonicalUpdateBuilder.update.mockReturnValue(canonicalUpdateBuilder);
    canonicalUpdateBuilder.eq.mockReturnValue(canonicalUpdateBuilder);
    mockFrom
      .mockReturnValueOnce(lookup)
      .mockReturnValueOnce(canonicalUpdateBuilder);

    await expect(pushRemoteSyncItem(tagItem())).resolves.toEqual({
      restartBatch: true,
    });
    expect(canonicalUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_name: "qa",
        deleted_at: null,
      }),
    );
    expect(canonicalUpdateBuilder.eq).toHaveBeenNthCalledWith(
      1,
      "owner_id",
      "owner-a",
    );
    expect(canonicalUpdateBuilder.eq).toHaveBeenNthCalledWith(
      2,
      "id",
      "remote-tag",
    );
    expect(mockReconcileTag).toHaveBeenCalledWith(
      "owner-a",
      "local-tag",
      {
        id: "remote-tag",
        name: "Qa",
        normalizedName: "qa",
        createdAt: remoteTag.created_at,
        updatedAt: "2026-08-19T03:27:55.333Z",
      },
    );
  });

  it("uses the normal tag primary key when no normalized-name conflict exists", async () => {
    const lookup = lookupBuilder(null);
    const upsert = jest.fn(async () => ({ error: null }));
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce({ upsert });

    await expect(pushRemoteSyncItem(tagItem())).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "local-tag", normalized_name: "qa" }),
      { onConflict: "owner_id,id" },
    );
    expect(mockReconcileTag).not.toHaveBeenCalled();
  });
});
