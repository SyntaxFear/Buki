import { File, Paths } from "expo-file-system";

import type { Drawing } from "@/store/migrate";
import { requireExportAccess } from "./export-access";

export type ArtworkImageExport = "png" | "jpg" | "card";

interface ArtworkExportCopyOptions {
  releaseSource?: () => void;
}

export function artworkExportBaseName(drawing: Pick<Drawing, "id" | "title" | "addedAt">): string {
  const title = drawing.title
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const fallback = drawing.id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(-24);
  const date = new Date(drawing.addedAt).toISOString().slice(0, 10);
  return `buki-${title || fallback || "artwork"}-${date}`;
}

export function artworkExportFilename(
  drawing: Pick<Drawing, "id" | "title" | "addedAt">,
  format: ArtworkImageExport,
): string {
  const suffix = format === "card" ? "-share-card" : "";
  const extension = format === "jpg" ? "jpg" : "png";
  return `${artworkExportBaseName(drawing)}${suffix}.${extension}`;
}

export async function copyArtworkExport(
  sourceUri: string,
  drawing: Pick<Drawing, "id" | "title" | "addedAt">,
  format: ArtworkImageExport,
  options: ArtworkExportCopyOptions = {},
): Promise<string> {
  const source = new File(sourceUri);
  const destination = new File(Paths.cache, artworkExportFilename(drawing, format));
  try {
    requireExportAccess(`artwork_${format}_export`);
    if (!source.exists) throw new Error("The artwork image is missing from this device.");
    await source.copy(destination, { overwrite: true });
    requireExportAccess(`artwork_${format}_export_commit`);
    return destination.uri;
  } catch (error) {
    try { if (destination.exists) destination.delete(); } catch {}
    throw error;
  } finally {
    try { options.releaseSource?.(); } catch {}
  }
}
