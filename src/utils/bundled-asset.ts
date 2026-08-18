import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";

/**
 * Resolve a Metro asset to a file that native image processors can read.
 *
 * In release builds Expo may point `localUri` at the read-only app bundle.
 * React Native's Image can display that URI, but native processing modules do
 * not consistently accept it. Stage embedded assets in the app cache first.
 */
export async function resolveBundledAssetUri(
  moduleId: number,
): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  if (!asset.localUri) await asset.downloadAsync();
  if (!asset.localUri) throw new Error("Could not resolve bundled asset");

  if (asset.localUri.startsWith(Paths.cache.uri)) return asset.localUri;

  const extension = asset.type.replace(/[^a-z0-9]/gi, "") || "bin";
  const cacheKey = asset.hash ?? String(moduleId);
  const destination = new File(
    Paths.cache,
    `buki-bundled-${cacheKey}.${extension}`,
  );
  await new File(asset.localUri).copy(destination, { overwrite: true });
  return destination.uri;
}
