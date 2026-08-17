export function shouldHydrateOnboardingField(
  status: "initializing" | "signedOut" | "signedIn",
  accountId: string | undefined,
  hydratedAccountId: string | null,
  hasSourceValue: boolean,
): boolean {
  return (
    status === "signedIn" &&
    Boolean(accountId) &&
    accountId !== hydratedAccountId &&
    hasSourceValue
  );
}
