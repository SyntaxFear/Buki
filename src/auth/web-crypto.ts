import {
  CryptoDigestAlgorithm,
  digest as expoDigest,
  getRandomValues as expoGetRandomValues,
  randomUUID as expoRandomUUID,
} from "expo-crypto";
import type { IntBasedTypedArray, UintBasedTypedArray } from "expo-modules-core";

import { copiedDigestBytes } from "@/utils/crypto";

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

export async function digestForSupabase(
  algorithm: DigestAlgorithm,
  data: DigestInput,
): Promise<ArrayBuffer> {
  if (algorithmName(algorithm) !== CryptoDigestAlgorithm.SHA256) {
    throw new Error("unsupported_web_crypto_digest");
  }
  return expoDigest(CryptoDigestAlgorithm.SHA256, copiedDigestBytes(data));
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
