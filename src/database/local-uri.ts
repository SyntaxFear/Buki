import { Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

interface UriTable {
  table: "adult_profiles" | "child_profiles" | "artworks" | "media_files";
  columns: readonly string[];
}

const URI_TABLES: readonly UriTable[] = [
  { table: "adult_profiles", columns: ["avatar_uri"] },
  { table: "child_profiles", columns: ["avatar_uri"] },
  { table: "artworks", columns: ["cutout_uri", "photo_uri", "preview_uri"] },
  { table: "media_files", columns: ["local_uri"] },
];

function safeDocumentRelativePath(uri: string): string | null {
  const marker = "/Documents/";
  const markerIndex = uri.indexOf(marker);
  if (!uri.startsWith("file://") || markerIndex < 0) return null;
  const relative = uri.slice(markerIndex + marker.length);
  if (!relative) return null;
  try {
    const segments = relative.split("/").map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/"))) {
      return null;
    }
  } catch {
    return null;
  }
  return relative;
}

export function rebaseDocumentFileUri(
  uri: string | null,
  documentUri: string = Paths.document.uri,
): string | null {
  if (!uri) return uri;
  const relative = safeDocumentRelativePath(uri);
  if (!relative) return uri;
  const root = documentUri.endsWith("/") ? documentUri : `${documentUri}/`;
  return `${root}${relative}`;
}

export async function rebaseStoredLocalUris(db: SQLiteDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const spec of URI_TABLES) {
      const rows = await tx.getAllAsync<Record<string, string | null>>(
        `SELECT id, ${spec.columns.join(", ")} FROM ${spec.table}`,
      );
      for (const row of rows) {
        const changedColumns: string[] = [];
        const values: (string | null)[] = [];
        for (const column of spec.columns) {
          const current = row[column];
          const next = rebaseDocumentFileUri(current);
          if (next === current) continue;
          changedColumns.push(column);
          values.push(next);
        }
        if (changedColumns.length === 0) continue;
        await tx.runAsync(
          `UPDATE ${spec.table} SET ${changedColumns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`,
          ...values,
          row.id,
        );
      }
    }
  });
}
