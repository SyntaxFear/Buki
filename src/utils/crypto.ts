import * as Crypto from "expo-crypto";

export type DigestInput = ArrayBuffer | ArrayBufferView;

export function copiedDigestBytes(data: DigestInput): Uint8Array<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
}

export function sha256Digest(data: DigestInput): Promise<ArrayBuffer> {
  return Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    copiedDigestBytes(data),
  );
}
