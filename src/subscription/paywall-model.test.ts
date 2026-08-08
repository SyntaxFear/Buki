import { annualSavingsPercent } from "./paywall-model";

describe("Buki Pro paywall calculations", () => {
  it("shows the configured yearly savings against twelve monthly payments", () => {
    expect(annualSavingsPercent(2.99, 19.99)).toBe(44);
  });

  it("does not advertise savings for invalid or more expensive yearly prices", () => {
    expect(annualSavingsPercent(0, 19.99)).toBeNull();
    expect(annualSavingsPercent(2.99, 40)).toBeNull();
  });
});
