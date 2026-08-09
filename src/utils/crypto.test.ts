const mockDigest = jest.fn<Promise<ArrayBuffer>, [string, Uint8Array]>(
  async () => new ArrayBuffer(32),
);

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: (algorithm: string, bytes: Uint8Array) => mockDigest(algorithm, bytes),
}));

import { copiedDigestBytes, sha256Digest } from "./crypto";

describe("native crypto inputs", () => {
  beforeEach(() => mockDigest.mockClear());

  it("copies ArrayBuffer input into a Uint8Array for Expo Crypto", async () => {
    const source = Uint8Array.from([1, 2, 3]).buffer;

    await sha256Digest(source);

    const input = mockDigest.mock.calls[0][1];
    expect(input).toBeInstanceOf(Uint8Array);
    expect(Array.from(input as Uint8Array)).toEqual([1, 2, 3]);
  });

  it("copies only the visible bytes of an ArrayBuffer view", () => {
    const source = Uint8Array.from([9, 1, 2, 3, 8]);

    expect(Array.from(copiedDigestBytes(source.subarray(1, 4)))).toEqual([1, 2, 3]);
  });
});
