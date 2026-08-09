const mockLoadMedia = jest.fn();
const mockMarkFailed = jest.fn();
const mockMarkUploaded = jest.fn();
const mockMarkUploading = jest.fn();
const mockSaveUsage = jest.fn();
const mockPrepareUpload = jest.fn();
const mockInvoke = jest.fn();
const mockUploadSigned = jest.fn();
const mockCleanup = jest.fn();

class MockMissingMediaSourceError extends Error {}

jest.mock("@/database", () => ({
  loadBukiLocalMedia: (...args: unknown[]) => mockLoadMedia(...args),
  markBukiMediaFailed: (...args: unknown[]) => mockMarkFailed(...args),
  markBukiMediaUploaded: (...args: unknown[]) => mockMarkUploaded(...args),
  markBukiMediaUploading: (...args: unknown[]) => mockMarkUploading(...args),
  saveBukiCloudUsage: (...args: unknown[]) => mockSaveUsage(...args),
}));

jest.mock("@/auth/supabase", () => ({
  getSupabaseClient: () => ({
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    storage: {
      from: () => ({
        uploadToSignedUrl: (...args: unknown[]) => mockUploadSigned(...args),
      }),
    },
  }),
}));

jest.mock("./media-transform", () => ({
  MissingMediaSourceError: MockMissingMediaSourceError,
  prepareMediaUpload: (...args: unknown[]) => mockPrepareUpload(...args),
}));

import type { SyncQueueItem } from "./types";
import {
  CloudMediaError,
  deleteQueuedMedia,
  uploadQueuedMedia,
} from "./media-upload";

const item: SyncQueueItem = {
  id: "queue-a",
  ownerId: "adult-a",
  operation: "upsert",
  entityType: "media_file",
  entityId: "media-a",
  payload: { owner_id: "adult-a" },
  attempts: 0,
  availableAt: 0,
  createdAt: 1,
  updatedAt: 2,
  lastError: null,
};

describe("cloud media account binding", () => {
  beforeEach(() => {
    for (const mock of [
      mockLoadMedia,
      mockMarkFailed,
      mockMarkUploaded,
      mockMarkUploading,
      mockSaveUsage,
      mockPrepareUpload,
      mockInvoke,
      mockUploadSigned,
      mockCleanup,
    ]) mock.mockReset();

    mockLoadMedia.mockResolvedValue({
      id: "media-a",
      ownerId: "adult-a",
      artworkId: "art-a",
      kind: "cutout",
      localUri: "file:///art-a.png",
      remotePath: null,
      checksum: null,
      byteSize: null,
      mimeType: null,
      uploadState: "local",
      createdAt: 1,
      updatedAt: 2,
    });
    mockPrepareUpload.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      checksum: "a".repeat(64),
      byteSize: 3,
      mimeType: "image/png",
      cleanup: mockCleanup,
    });
    mockMarkFailed.mockResolvedValue(undefined);
    mockMarkUploaded.mockResolvedValue(undefined);
    mockMarkUploading.mockResolvedValue(undefined);
    mockSaveUsage.mockResolvedValue(undefined);
    mockUploadSigned.mockResolvedValue({ error: null });
  });

  it("binds create and completion requests to the queued owner", async () => {
    mockInvoke
      .mockResolvedValueOnce({
        data: {
          deduplicated: false,
          reservationId: "reservation-a",
          path: "adult-a/_uploads/reservation-a",
          token: "signed-token",
          bytesUsed: 0,
          bytesLimit: 2 * 1024 * 1024 * 1024,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          path: "adult-a/media/reservation-a",
          checksum: "a".repeat(64),
          byteSize: 3,
          mimeType: "image/png",
          bytesUsed: 3,
          bytesLimit: 2 * 1024 * 1024 * 1024,
        },
        error: null,
      });

    await uploadQueuedMedia(item);

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "create-media-upload", {
      body: expect.objectContaining({ ownerId: "adult-a", mediaId: "media-a" }),
    });
    expect(mockUploadSigned).toHaveBeenCalledWith(
      "adult-a/_uploads/reservation-a",
      "signed-token",
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: "image/png" }),
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "complete-media-upload", {
      body: { ownerId: "adult-a", reservationId: "reservation-a" },
    });
    expect(mockMarkUploaded).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "adult-a",
      mediaId: "media-a",
      remotePath: "adult-a/media/reservation-a",
    }));
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it("fails closed if the authenticated account changes during upload", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: {
          clone: () => ({ json: async () => ({ error: "account_session_changed" }) }),
        },
      },
    });

    await expect(uploadQueuedMedia(item)).rejects.toEqual(
      expect.objectContaining<Partial<CloudMediaError>>({
        code: "account_session_changed",
      }),
    );

    expect(mockUploadSigned).not.toHaveBeenCalled();
    expect(mockMarkFailed).toHaveBeenCalledWith("adult-a", "media-a", false);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it("binds media deletion to the queued owner", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { deleted: true, bytesUsed: 0, bytesLimit: 2 * 1024 * 1024 * 1024 },
      error: null,
    });

    await deleteQueuedMedia({ ...item, operation: "delete" });

    expect(mockInvoke).toHaveBeenCalledWith("delete-media", {
      body: expect.objectContaining({ ownerId: "adult-a", mediaId: "media-a" }),
    });
  });
});
