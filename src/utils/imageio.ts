import {
  AlphaType,
  ColorType,
  ImageFormat,
  Skia,
  type SkImage,
} from "@shopify/react-native-skia";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import {
  createReviewMediaFiles,
  discardReviewCutout,
  preserveReviewPhoto,
  type ReviewCutout,
} from "@/utils/capture-review-media";
import { extractDrawing } from "@/utils/cutout";
import { inspectSafeImage, MAX_SAFE_IMAGE_BYTES } from "@/utils/image-safety";

export { resolveBundledAssetUri as resolveAssetUri } from "@/utils/bundled-asset";

const MAX_DECODE_EDGE = 1000;
const SAVED_PHOTO_EDGE = 2048;

export type {
  ProcessedCutout,
  ReviewCutout,
} from "@/utils/capture-review-media";

export function readUriBytes(uri: string): Uint8Array {
  return new File(uri).bytesSync();
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
  const scale = Math.min(
    1,
    MAX_DECODE_EDGE / Math.max(image.width(), image.height()),
  );
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

export function pixelsToImage(
  pixels: Uint8Array,
  width: number,
  height: number,
): SkImage {
  const image = Skia.Image.MakeImage(
    {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    },
    Skia.Data.fromBytes(pixels),
    width * 4,
  );
  if (!image) throw new Error("Could not build cutout image");
  return image;
}

async function sanitizedImage(
  sourceUri: string,
  maxEdge: number,
  format: SaveFormat,
  compress: number,
): Promise<File> {
  const source = new File(sourceUri);
  if (
    !source.exists ||
    source.size <= 0 ||
    source.size > MAX_SAFE_IMAGE_BYTES
  ) {
    throw new Error("The image file is too large.");
  }
  const metadata = inspectSafeImage(source.bytesSync());
  let resize: { width?: number; height?: number } | null = null;
  if (Math.max(metadata.width, metadata.height) > maxEdge) {
    resize =
      metadata.width >= metadata.height
        ? { width: maxEdge }
        : { height: maxEdge };
  }

  const output = ImageManipulator.manipulate(sourceUri);
  let rendered: Awaited<ReturnType<typeof output.renderAsync>> | null = null;
  try {
    if (resize) output.resize(resize);
    rendered = await output.renderAsync();
    const saved = await rendered.saveAsync({ format, compress });
    return new File(saved.uri);
  } finally {
    rendered?.release();
    output.release();
  }
}

/**
 * Review pipeline: photo URI -> temporary transparent PNG cutout on disk.
 * Returns null when no drawing was found in the photo.
 */
export async function processPhotoForReview(
  photoUri: string,
): Promise<ReviewCutout | null> {
  const prepared = await sanitizedImage(
    photoUri,
    MAX_DECODE_EDGE,
    SaveFormat.PNG,
    1,
  );
  let review: ReviewCutout | null = null;
  try {
    const image = decodeImage(readUriBytes(prepared.uri));
    const { pixels, width, height } = imageToPixels(image);

    const result = extractDrawing(pixels, width, height);
    if (!result) return null;

    const cutoutImage = pixelsToImage(
      result.pixels,
      result.width,
      result.height,
    );
    const png = cutoutImage.encodeToBytes(ImageFormat.PNG, 100);
    if (!png) throw new Error("Could not encode cutout PNG");

    const reviewFiles = createReviewMediaFiles();
    reviewFiles.cutout.write(png);

    review = {
      storage: "review",
      uri: reviewFiles.cutout.uri,
      width: result.width,
      height: result.height,
      inkBox: result.inkBox,
      paperBox: result.paperBox,
      sourceWidth: width,
      sourceHeight: height,
    };

    let savedPhotoUri: string | undefined;
    try {
      const sanitizedPhoto = await sanitizedImage(
        photoUri,
        SAVED_PHOTO_EDGE,
        SaveFormat.JPEG,
        0.85,
      );
      await preserveReviewPhoto(sanitizedPhoto, reviewFiles.photo);
      savedPhotoUri = reviewFiles.photo.uri;
      review.photoUri = savedPhotoUri;
    } catch (error) {
      console.warn("Could not preserve original photo", error);
    }

    return review;
  } catch (error) {
    discardReviewCutout(review);
    throw error;
  } finally {
    try {
      if (prepared.exists) prepared.delete();
    } catch {}
  }
}
