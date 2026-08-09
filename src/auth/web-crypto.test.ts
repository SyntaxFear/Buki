const mockExpoDigest = jest.fn(
  async (_algorithm: string, _data: ArrayBuffer) => new Uint8Array([7, 8, 9]).buffer,
);
const mockExpoGetRandomValues = jest.fn(<T extends ArrayBufferView>(array: T) => array);
const mockExpoRandomUUID = jest.fn(() => "00000000-0000-4000-8000-000000000000");

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: (algorithm: string, data: ArrayBuffer) => mockExpoDigest(algorithm, data),
  getRandomValues: <T extends ArrayBufferView>(array: T) => mockExpoGetRandomValues(array),
  randomUUID: () => mockExpoRandomUUID(),
}));

import { digestForSupabase, installSupabaseWebCrypto } from "./web-crypto";

describe("Supabase WebCrypto bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds the SHA-256 digest required for S256 PKCE", async () => {
    const getRandomValues = jest.fn(<T extends ArrayBufferView>(array: T) => array);
    const host: Parameters<typeof installSupabaseWebCrypto>[0] = {
      crypto: { getRandomValues },
    };

    installSupabaseWebCrypto(host);
    const input = new Uint8Array([1, 2, 3]);
    const result = await host.crypto?.subtle?.digest?.("SHA-256", input);

    expect(new Uint8Array(result ?? new ArrayBuffer(0))).toEqual(new Uint8Array([7, 8, 9]));
    expect(mockExpoDigest).toHaveBeenCalledWith("SHA-256", input);
    expect(host.crypto?.getRandomValues).toBe(getRandomValues);
  });

  it("preserves a complete WebCrypto implementation", () => {
    const digest = jest.fn(async () => new ArrayBuffer(0));
    const host: Parameters<typeof installSupabaseWebCrypto>[0] = {
      crypto: { subtle: { digest } },
    };

    installSupabaseWebCrypto(host);

    expect(host.crypto?.subtle?.digest).toBe(digest);
    expect(mockExpoDigest).not.toHaveBeenCalled();
  });

  it("installs secure random helpers when React Native does not provide them", () => {
    const host: Parameters<typeof installSupabaseWebCrypto>[0] = {};

    installSupabaseWebCrypto(host);

    const bytes = new Uint8Array(4);
    host.crypto?.getRandomValues?.(bytes);
    expect(mockExpoGetRandomValues).toHaveBeenCalledWith(bytes);
    expect(host.crypto?.randomUUID?.()).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("rejects digest algorithms outside the narrow PKCE requirement", async () => {
    await expect(digestForSupabase("SHA-1", new Uint8Array([1]))).rejects.toThrow(
      "unsupported_web_crypto_digest",
    );
  });
});
