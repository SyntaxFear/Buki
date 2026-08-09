import {
  CryptoDigestAlgorithm,
  digest as expoDigest,
  getRandomValues as expoGetRandomValues,
  randomUUID as expoRandomUUID,
} from "expo-crypto";
import type { IntBasedTypedArray, UintBasedTypedArray } from "expo-modules-core";

type DigestAlgorithm = string | { name?: string };
type DigestInput = ArrayBuffer | ArrayBufferView;
type RandomValueArray = IntBasedTypedArray | UintBasedTypedArray;

type CryptoLike = {
  getRandomValues?: <T extends RandomValueArray>(array: T) => T;
  randomUUID?: () => string;
  subtle?: {
    digest?: (algorithm: DigestAlgorithm, data: DigestInput) => Promise<ArrayBuffer>;
  };
};

type CryptoHost = { crypto?: CryptoLike };

function algorithmName(algorithm: DigestAlgorithm): string {
  return (typeof algorithm === "string" ? algorithm : algorithm.name ?? "").toUpperCase();
}

function copiedBytes(data: DigestInput): Uint8Array<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
}

export async function digestForSupabase(
  algorithm: DigestAlgorithm,
  data: DigestInput,
): Promise<ArrayBuffer> {
  if (algorithmName(algorithm) !== CryptoDigestAlgorithm.SHA256) {
    throw new Error("unsupported_web_crypto_digest");
  }
  return expoDigest(CryptoDigestAlgorithm.SHA256, copiedBytes(data));
}

export function installSupabaseWebCrypto(
  host: CryptoHost = globalThis as unknown as CryptoHost,
): void {
  const crypto = host.crypto ?? {};
  const subtle = crypto.subtle ?? {};

  if (typeof crypto.getRandomValues !== "function") {
    crypto.getRandomValues = expoGetRandomValues;
  }
  if (typeof crypto.randomUUID !== "function") {
    crypto.randomUUID = expoRandomUUID;
  }
  if (typeof subtle.digest !== "function") {
    subtle.digest = digestForSupabase;
  }

  crypto.subtle = subtle;
  host.crypto = crypto;
}
