import { reconcileBeforeArchiveImport } from "./import-guard";

describe("archive import cloud reconciliation", () => {
  it("continues only after the current cloud library is restored", async () => {
    const restore = jest.fn(async () => true);

    await expect(
      reconcileBeforeArchiveImport(restore, () => null),
    ).resolves.toBeUndefined();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("fails closed when cloud reconciliation is unavailable", async () => {
    await expect(
      reconcileBeforeArchiveImport(
        async () => false,
        () => "Connect to the internet to restore this device.",
      ),
    ).rejects.toThrow("Connect to the internet");
  });
});
