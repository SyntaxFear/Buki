import { rebaseDocumentFileUri, rebaseStoredLocalUris } from "./local-uri";

describe("local document URI rebasing", () => {
  test("rebases an old iOS app container while preserving the relative path", () => {
    expect(
      rebaseDocumentFileUri(
        "file:///old/container/Documents/drawings/drawing-1.png",
        "file:///new/container/Documents/",
      ),
    ).toBe("file:///new/container/Documents/drawings/drawing-1.png");
  });

  test("leaves non-document and unsafe paths unchanged", () => {
    expect(rebaseDocumentFileUri("https://example.com/art.png", "file:///new/Documents/")).toBe(
      "https://example.com/art.png",
    );
    expect(
      rebaseDocumentFileUri("file:///old/Documents/../Library/private.db", "file:///new/Documents/"),
    ).toBe("file:///old/Documents/../Library/private.db");
  });

  test("updates every persisted local URI column that moved with the container", async () => {
    const updates: { sql: string; values: unknown[] }[] = [];
    const rowsByTable: Record<string, Record<string, string | null>[]> = {
      adult_profiles: [{ id: "adult", avatar_uri: "emoji:🌻" }],
      child_profiles: [{ id: "child", avatar_uri: null }],
      artworks: [{
        id: "art",
        cutout_uri: "file:///old/Documents/drawings/art.png",
        photo_uri: "file:///old/Documents/photos/art.jpg",
        preview_uri: null,
      }],
      media_files: [{ id: "art:cutout", local_uri: "file:///old/Documents/drawings/art.png" }],
    };
    const tx = {
      getAllAsync: jest.fn(async (sql: string) => {
        const table = Object.keys(rowsByTable).find((name) => sql.includes(`FROM ${name}`));
        return table ? rowsByTable[table] : [];
      }),
      runAsync: jest.fn(async (sql: string, ...values: unknown[]) => {
        updates.push({ sql, values });
      }),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback: (database: typeof tx) => Promise<void>) => {
        await callback(tx);
      }),
    };

    await rebaseStoredLocalUris(db as never);

    expect(updates).toHaveLength(2);
    expect(updates[0].sql).toContain("UPDATE artworks SET cutout_uri = ?, photo_uri = ?");
    expect(updates[0].values.at(-1)).toBe("art");
    expect(updates[1].sql).toContain("UPDATE media_files SET local_uri = ?");
    expect(updates[1].values.at(-1)).toBe("art:cutout");
  });
});
