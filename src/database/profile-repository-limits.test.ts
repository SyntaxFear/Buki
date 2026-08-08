import { ContentLimitReachedError, resolveCapabilities } from "@/subscription/access";
import { createLocalChild } from "./profile-repository";

function child() {
  return {
    id: "child-new",
    name: "New child",
    avatarColor: "#FFE27A",
    avatarUri: null,
    birthMonth: null,
    birthYear: null,
  };
}

function databaseWithCounts(childCount: number, sketchpadCount: number) {
  const tx = {
    getFirstAsync: jest
      .fn()
      .mockResolvedValueOnce({ count: childCount })
      .mockResolvedValueOnce({ count: sketchpadCount }),
    runAsync: jest.fn(),
  };
  const db = {
    getFirstAsync: jest.fn().mockResolvedValue({ value: "adult-a" }),
    withExclusiveTransactionAsync: jest.fn(async (operation: (transaction: typeof tx) => Promise<void>) =>
      operation(tx),
    ),
  };
  return { db, tx };
}

describe("atomic child and default-sketchpad limits", () => {
  it("checks the child count inside the exclusive write transaction", async () => {
    const { db, tx } = databaseWithCounts(1, 0);
    const free = resolveCapabilities("free");

    await expect(
      createLocalChild(db as never, child(), "pad-new", free),
    ).rejects.toEqual(new ContentLimitReachedError("children"));
    expect(tx.runAsync).not.toHaveBeenCalled();
  });

  it("does not create a default sketchpad above the sketchpad limit", async () => {
    const { db, tx } = databaseWithCounts(0, 1);
    const free = resolveCapabilities("free");

    await expect(
      createLocalChild(db as never, child(), "pad-new", free),
    ).rejects.toEqual(new ContentLimitReachedError("sketchpads"));
    expect(tx.runAsync).not.toHaveBeenCalled();
  });
});
