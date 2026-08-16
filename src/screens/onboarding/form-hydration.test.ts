import { shouldHydrateOnboardingField } from "./form-hydration";

describe("onboarding form hydration", () => {
  it("hydrates a saved value once for the signed-in adult account", () => {
    expect(
      shouldHydrateOnboardingField("signedIn", "adult-a", null, true),
    ).toBe(true);
    expect(
      shouldHydrateOnboardingField(
        "signedIn",
        "adult-a",
        "adult-a",
        true,
      ),
    ).toBe(false);
  });

  it("does not refill a field after the user intentionally clears it", () => {
    const hydratedAccountId = "adult-a";

    expect(
      shouldHydrateOnboardingField(
        "signedIn",
        "adult-a",
        hydratedAccountId,
        true,
      ),
    ).toBe(false);
  });

  it("waits for persisted profile data before marking a field hydrated", () => {
    expect(
      shouldHydrateOnboardingField("signedIn", "adult-a", null, false),
    ).toBe(false);
  });
});
