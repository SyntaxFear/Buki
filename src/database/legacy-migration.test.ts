const mockLegacyFiles = new Map<string, string>();

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documents" },
  File: class MockFile {
    readonly name: string;

    constructor(_directory: string, name: string) {
      this.name = name;
    }

    get exists() {
      return mockLegacyFiles.has(this.name);
    }

    textSync() {
      return mockLegacyFiles.get(this.name) ?? "";
    }
  },
}));

import { migrateLegacyJson, readLegacySource } from "./legacy-migration";

describe("legacy JSON source recovery", () => {
  beforeEach(() => {
    mockLegacyFiles.clear();
    jest.restoreAllMocks();
  });

  it("does not treat malformed legacy JSON as an absent source", () => {
    mockLegacyFiles.set("buki.json", "{not-json");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => readLegacySource()).toThrow("Legacy buki.json could not be parsed");
  });

  it("does not start a transaction or write a completion marker for malformed JSON", async () => {
    mockLegacyFiles.set("buki.json", "{not-json");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      withExclusiveTransactionAsync: jest.fn().mockResolvedValue(undefined),
    };

    await expect(migrateLegacyJson(db as never)).rejects.toThrow(
      "Legacy buki.json could not be parsed",
    );
    expect(db.withExclusiveTransactionAsync).not.toHaveBeenCalled();

    mockLegacyFiles.set(
      "buki.json",
      JSON.stringify({ version: 5, activePadId: null, pads: [], drawingsByPad: {} }),
    );
    await expect(migrateLegacyJson(db as never)).resolves.toBeUndefined();
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  });
});
