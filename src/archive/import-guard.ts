export async function reconcileBeforeArchiveImport(
  restoreCloud: () => Promise<boolean>,
  restoreError: () => string | null,
): Promise<void> {
  if (await restoreCloud()) return;
  throw new Error(
    restoreError() ??
      "Buki could not reconcile this account’s cloud library before importing.",
  );
}
