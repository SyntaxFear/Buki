import {
  deletionSteps,
  privacyPolicy,
  SUPPORT_EMAIL,
  supportQuestions,
  termsOfUse,
} from "@/marketing/content";

describe("public release content", () => {
  const publicCopy = JSON.stringify({ deletionSteps, privacyPolicy, supportQuestions, termsOfUse });

  it("keeps the published support destination and effective date", () => {
    expect(SUPPORT_EMAIL).toBe("levani.parastashvili@gmail.com");
    expect(privacyPolicy.effectiveDate).toBe("Effective August 8, 2026");
    expect(termsOfUse.effectiveDate).toBe("Effective August 8, 2026");
  });

  it("documents the approved Free and Pro limits", () => {
    expect(publicCopy).toContain("one child profile, one sketchpad, and up to 20 artworks");
    expect(publicCopy).toContain("2 GB");
    expect(publicCopy).toContain("up to 90 days");
  });

  it("documents the approved iOS prices and trial", () => {
    expect(publicCopy).toContain("$2.99 monthly");
    expect(publicCopy).toContain("$19.99 yearly");
    expect(publicCopy).toContain("$39.99 lifetime");
    expect(publicCopy).toContain("7-day free trial");
  });

  it("avoids long dash punctuation in customer-facing copy", () => {
    expect(publicCopy).not.toMatch(/[—–]/u);
  });
});
