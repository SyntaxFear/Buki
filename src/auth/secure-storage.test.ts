const mockSecureValues = new Map<string, string>();
let mockSetCall = 0;
let mockFailSetCall: number | null = null;

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSetCall += 1;
    if (mockFailSetCall === mockSetCall) throw new Error("interrupted secure write");
    mockSecureValues.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureValues.delete(key);
  }),
}));

import { secureSessionStorage } from "./secure-storage";

describe("atomic secure session storage", () => {
  beforeEach(() => {
    mockSecureValues.clear();
    mockSetCall = 0;
    mockFailSetCall = null;
    jest.clearAllMocks();
  });

  it("reads the previous chunk format for existing installs", async () => {
    mockSecureValues.set("session.chunks", "2");
    mockSecureValues.set("session.0", "old-");
    mockSecureValues.set("session.1", "session");

    await expect(secureSessionStorage.getItem("session")).resolves.toBe("old-session");
  });

  it("commits a complete generation and removes superseded chunks", async () => {
    mockSecureValues.set("session.chunks", "2");
    mockSecureValues.set("session.0", "old-");
    mockSecureValues.set("session.1", "session");
    const value = "n".repeat(4_100);

    await secureSessionStorage.setItem("session", value);

    await expect(secureSessionStorage.getItem("session")).resolves.toBe(value);
    expect(mockSecureValues.has("session.chunks")).toBe(false);
    expect(mockSecureValues.has("session.0")).toBe(false);
    expect(mockSecureValues.has("session.1")).toBe(false);
  });

  it("keeps the last committed value when a later chunk write is interrupted", async () => {
    const previous = "a".repeat(4_100);
    await secureSessionStorage.setItem("session", previous);
    mockSetCall = 0;
    mockFailSetCall = 2;

    await expect(secureSessionStorage.setItem("session", "b".repeat(4_100))).rejects.toThrow(
      "interrupted secure write",
    );

    await expect(secureSessionStorage.getItem("session")).resolves.toBe(previous);
  });

  it("commits a removal tombstone before deleting token chunks", async () => {
    await secureSessionStorage.setItem("session", "secret-session");
    await secureSessionStorage.removeItem("session");

    await expect(secureSessionStorage.getItem("session")).resolves.toBeNull();
    expect(mockSecureValues.get("session.manifest")).toContain('"state":"removed"');
  });
});
