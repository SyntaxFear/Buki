const mockEnqueueCurrentAdultProfile = jest.fn();
const mockEnqueueCurrentChildProfile = jest.fn();
const mockEnqueueCurrentSketchpad = jest.fn();

jest.mock("./sync-serialization", () => ({
  enqueueCurrentAdultProfile: (...args: unknown[]) => mockEnqueueCurrentAdultProfile(...args),
  enqueueCurrentChildProfile: (...args: unknown[]) => mockEnqueueCurrentChildProfile(...args),
  enqueueCurrentSketchpad: (...args: unknown[]) => mockEnqueueCurrentSketchpad(...args),
  enqueueEntityDeletion: jest.fn(),
}));

import { completeLocalOnboarding } from "./profile-repository";

const input = {
  adultName: "Buki Parent",
  adultAvatarUri: "emoji:🌻",
  childId: "child-new",
  childName: "Mia",
  childAvatarColor: "#FFD65A",
  defaultPadId: "pad-new",
};

function database(firstChild: { id: string } | null, firstPad: { id: string } | null) {
  const tx = {
    getFirstAsync: jest.fn().mockResolvedValueOnce(firstChild).mockResolvedValueOnce(firstPad),
    runAsync: jest.fn().mockResolvedValue(undefined),
  };
  const db = {
    getFirstAsync: jest.fn().mockResolvedValue({ value: "adult-a" }),
    withExclusiveTransactionAsync: jest.fn(
      async (operation: (transaction: typeof tx) => Promise<void>) => operation(tx),
    ),
  };
  return { db, tx };
}

function normalizedStatements(tx: ReturnType<typeof database>["tx"]): string[] {
  return tx.runAsync.mock.calls.map(([statement]) => String(statement).replace(/\s+/g, " ").trim());
}

describe("onboarding replay organization safety", () => {
  beforeEach(() => {
    mockEnqueueCurrentAdultProfile.mockReset();
    mockEnqueueCurrentChildProfile.mockReset();
    mockEnqueueCurrentSketchpad.mockReset();
  });

  it("preserves every existing sketchpad-to-child assignment during replay", async () => {
    const { db, tx } = database({ id: "child-a" }, { id: "pad-a" });

    await completeLocalOnboarding(db as never, input);

    expect(normalizedStatements(tx)).not.toContainEqual(
      expect.stringContaining("UPDATE sketchpads SET child_id"),
    );
    expect(tx.getFirstAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("child_id = ?"),
      "adult-a",
      "child-a",
    );
    expect(mockEnqueueCurrentSketchpad).toHaveBeenCalledWith(tx, "adult-a", "pad-a");
  });

  it("attaches legacy sketchpads only when onboarding creates the first child", async () => {
    const { db, tx } = database(null, { id: "legacy-pad" });

    await completeLocalOnboarding(db as never, input);

    const update = tx.runAsync.mock.calls.find(([statement]) =>
      String(statement).includes("UPDATE sketchpads SET child_id"),
    );
    expect(update).toEqual([
      expect.stringContaining("UPDATE sketchpads SET child_id"),
      "child-new",
      expect.any(Number),
      "adult-a",
    ]);
    expect(mockEnqueueCurrentSketchpad).toHaveBeenCalledWith(tx, "adult-a", "legacy-pad");
  });

  it("creates the first sketchpad as a vertical single-page pad", async () => {
    const { db, tx } = database(null, null);

    await completeLocalOnboarding(db as never, input);

    expect(normalizedStatements(tx)).toContainEqual(
      expect.stringContaining("'My Book', 'vertical', 'sunshine'"),
    );
    expect(mockEnqueueCurrentSketchpad).toHaveBeenCalledWith(
      tx,
      "adult-a",
      "pad-new",
    );
  });
});
