const mockRestoreSnapshot = jest.fn();
const mockDownload = jest.fn();
const mockRangeCalls: Array<{ table: string; from: number; to: number; orders: string[] }> = [];
const mockDeviceUpdates: Array<Record<string, unknown>> = [];
let mockDeviceUpdateResult: { data: unknown; error: { code?: string; message: string } | null } = {
  data: null,
  error: null,
};
const mockRows: Record<string, any[]> = {};
const mockFiles = new Map<string, Uint8Array>();

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function mockQuery(table: string) {
  let mode: "select" | "update" = "select";
  let updatePayload: Record<string, unknown> | null = null;
  const filters: Array<[string, unknown]> = [];
  const orders: string[] = [];
  const builder: any = {
    select: () => builder,
    update: (payload: Record<string, unknown>) => {
      mode = "update";
      updatePayload = payload;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      if (mode === "update" && filters.length >= 2) {
        mockDeviceUpdates.push({ table, payload: updatePayload, filters: [...filters] });
        return Promise.resolve(mockDeviceUpdateResult);
      }
      return builder;
    },
    order: (column: string) => {
      orders.push(column);
      return builder;
    },
    range: async (from: number, to: number) => {
      mockRangeCalls.push({ table, from, to, orders: [...orders] });
      const owner = filters.find(([column]) => column === "owner_id")?.[1];
      const rows = (mockRows[table] ?? []).filter(
        (row) => owner === undefined || row.owner_id === owner,
      );
      return { data: rows.slice(from, to + 1), error: null };
    },
    maybeSingle: async () => {
      const owner = filters.find(([column]) => column === "owner_id")?.[1];
      const rows = (mockRows[table] ?? []).filter(
        (row) => owner === undefined || row.owner_id === owner,
      );
      return { data: rows[0] ?? null, error: null };
    },
  };
  return builder;
}

jest.mock("expo-file-system", () => ({
  Directory: class MockDirectory {
    readonly uri: string;

    constructor(base: string | { uri: string }, ...segments: string[]) {
      this.uri = [typeof base === "string" ? base : base.uri, ...segments].join("/");
    }

    create() {}
  },
  File: class MockFile {
    readonly uri: string;

    constructor(base: string | { uri: string }, ...segments: string[]) {
      this.uri = segments.length
        ? [typeof base === "string" ? base : base.uri, ...segments].join("/")
        : typeof base === "string" ? base : base.uri;
    }

    get exists(): boolean {
      return mockFiles.has(this.uri);
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      const bytes = mockFiles.get(this.uri);
      if (!bytes) throw new Error("Missing file");
      return bytes.slice().buffer;
    }

    create(): void {
      mockFiles.set(this.uri, new Uint8Array());
    }

    write(bytes: Uint8Array): void {
      mockFiles.set(this.uri, new Uint8Array(bytes));
    }

    delete(): void {
      mockFiles.delete(this.uri);
    }
  },
  Paths: { document: { uri: "file:///documents" } },
}));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: async (_algorithm: string, buffer: ArrayBuffer) =>
    globalThis.crypto.subtle.digest("SHA-256", buffer),
}));

jest.mock("@/auth/supabase", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => mockQuery(table),
    storage: {
      from: () => ({ download: (...args: unknown[]) => mockDownload(...args) }),
    },
  }),
}));

jest.mock("@/database", () => ({
  restoreBukiCloudSnapshot: (...args: unknown[]) => mockRestoreSnapshot(...args),
}));

import { restoreCloudAccount } from "./cloud-restore";

function media(overrides: Record<string, unknown> = {}) {
  return {
    owner_id: "owner-a",
    id: "media-a",
    artwork_id: "art-a",
    kind: "cutout",
    storage_path: "owner-a/aa/media.png",
    checksum: "a".repeat(64),
    byte_size: 3,
    mime_type: "image/png",
    upload_state: "uploaded",
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
    server_updated_at: "2026-08-09T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("cloud restore network boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRangeCalls.length = 0;
    mockDeviceUpdates.length = 0;
    mockFiles.clear();
    for (const key of Object.keys(mockRows)) delete mockRows[key];
    mockRows.adult_profiles = [{ owner_id: "owner-a", display_name: "Parent" }];
    mockRows.storage_usage = [{
      owner_id: "owner-a",
      bytes_used: 0,
      bytes_limit: 2_147_483_648,
    }];
    mockDeviceUpdateResult = { data: null, error: null };
    mockRestoreSnapshot.mockImplementation(async (_ownerId: string, snapshot: any) => ({
      children: snapshot.children.length,
      sketchpads: snapshot.sketchpads.length,
      artworks: snapshot.artworks.length,
      mediaFiles: snapshot.mediaFiles.length,
      failedMediaCount: snapshot.failedMediaCount,
      restoredAt: "2026-08-09T08:00:00.000Z",
    }));
  });

  it("paginates beyond 500 rows with deterministic ordering", async () => {
    mockRows.child_profiles = Array.from({ length: 501 }, (_, index) => ({
      owner_id: "owner-a",
      id: `child-${String(index).padStart(4, "0")}`,
    }));

    await restoreCloudAccount("owner-a", null);

    const snapshot = mockRestoreSnapshot.mock.calls[0][1];
    expect(snapshot.children).toHaveLength(501);
    expect(mockRangeCalls.filter((call) => call.table === "child_profiles")).toEqual([
      { table: "child_profiles", from: 0, to: 499, orders: ["id"] },
      { table: "child_profiles", from: 500, to: 999, orders: ["id"] },
    ]);
  });

  it("reuses one checksum-valid cached file for duplicate media", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const checksum = await sha256(bytes);
    const uri = `file:///documents/Buki/Cloud/owner-a/${checksum}-cutout.png`;
    mockFiles.set(uri, bytes);
    mockRows.media_files = [
      media({ id: "media-a", artwork_id: "art-a", checksum }),
      media({ id: "media-b", artwork_id: "art-b", checksum }),
    ];

    await restoreCloudAccount("owner-a", null);

    const snapshot = mockRestoreSnapshot.mock.calls[0][1];
    expect(snapshot.mediaFiles).toHaveLength(2);
    expect(snapshot.mediaFiles[0].local_uri).toBe(uri);
    expect(snapshot.mediaFiles[1].local_uri).toBe(uri);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("counts corrupt downloads without committing them", async () => {
    const expected = Uint8Array.from([1, 2, 3]);
    const checksum = await sha256(expected);
    mockRows.media_files = [media({ checksum })];
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: async () => Uint8Array.from([9, 9, 9]).buffer },
      error: null,
    });

    await restoreCloudAccount("owner-a", null);

    const snapshot = mockRestoreSnapshot.mock.calls[0][1];
    expect(snapshot.mediaFiles).toHaveLength(0);
    expect(snapshot.failedMediaCount).toBe(1);
  });

  it("does not report success when recording the device pull timestamp fails", async () => {
    mockDeviceUpdateResult = {
      data: null,
      error: { code: "42501", message: "denied" },
    };

    await expect(restoreCloudAccount("owner-a", "device-a")).rejects.toThrow(
      "could not record the completed cloud pull",
    );
    expect(mockDeviceUpdates[0]).toEqual(expect.objectContaining({
      table: "sync_devices",
      payload: { last_pulled_at: "2026-08-09T08:00:00.000Z" },
    }));
  });
});
