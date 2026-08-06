import {
  AlphaType,
  ColorType,
  ImageFormat,
  Skia,
  type SkImage,
} from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";

import { extractDrawing, type Box } from "@/utils/cutout";

const MAX_DECODE_EDGE = 1000;

export interface ProcessedCutout {
  /** file:// URI of the saved transparent PNG */
  uri: string;
  width: number;
  height: number;
  /** where the ink sits inside the downscaled source photo */
  inkBox: Box;
  paperBox: Box;
  /** downscaled source photo dimensions the boxes refer to */
  sourceWidth: number;
  sourceHeight: number;
}

function drawingsDir(): Directory {
  const dir = new Directory(Paths.document, "drawings");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function readUriBytes(uri: string): Uint8Array {
  return new File(uri).bytesSync();
}

export async function resolveAssetUri(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  if (!asset.localUri) await asset.downloadAsync();
  if (!asset.localUri) throw new Error("Could not resolve bundled asset");
  return asset.localUri;
}

export function decodeImage(bytes: Uint8Array): SkImage {
  const data = Skia.Data.fromBytes(bytes);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error("Could not decode image");
  return image;
}

/** Downscale so the long edge is <= MAX_DECODE_EDGE, return raw RGBA. */
export function imageToPixels(image: SkImage): {
  pixels: Uint8Array;
  width: number;
  height: number;
} {
  const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(image.width(), image.height()));
  const width = Math.max(1, Math.round(image.width() * scale));
  const height = Math.max(1, Math.round(image.height() * scale));

  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error("Could not create surface");
  const canvas = surface.getCanvas();
  canvas.drawImageRect(
    image,
    { x: 0, y: 0, width: image.width(), height: image.height() },
    { x: 0, y: 0, width, height },
    Skia.Paint(),
  );
  const snapshot = surface.makeImageSnapshot();
  const pixels = snapshot.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  }) as Uint8Array | null;
  if (!pixels) throw new Error("Could not read pixels");
  return { pixels: new Uint8Array(pixels.buffer ?? pixels), width, height };
}

export function pixelsToImage(pixels: Uint8Array, width: number, height: number): SkImage {
  const image = Skia.Image.MakeImage(
    { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    Skia.Data.fromBytes(pixels),
    width * 4,
  );
  if (!image) throw new Error("Could not build cutout image");
  return image;
}

/**
 * Full pipeline: photo URI -> transparent PNG cutout on disk.
 * Returns null when no drawing was found in the photo.
 */
export async function processPhotoToCutout(photoUri: string): Promise<ProcessedCutout | null> {
  const image = decodeImage(readUriBytes(photoUri));
  const { pixels, width, height } = imageToPixels(image);

  const result = extractDrawing(pixels, width, height);
  if (!result) return null;

  const cutoutImage = pixelsToImage(result.pixels, result.width, result.height);
  const png = cutoutImage.encodeToBytes(ImageFormat.PNG, 100);
  if (!png) throw new Error("Could not encode cutout PNG");

  const file = new File(drawingsDir(), `drawing-${Date.now()}.png`);
  file.write(png);

  return {
    uri: file.uri,
    width: result.width,
    height: result.height,
    inkBox: result.inkBox,
    paperBox: result.paperBox,
    sourceWidth: width,
    sourceHeight: height,
  };
}
