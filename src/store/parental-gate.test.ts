import { useParentalGate } from "./parental-gate";

describe("parental confirmation gate", () => {
  afterEach(() => {
    useParentalGate.getState().cancel();
  });

  it("resolves only after the arithmetic challenge is answered", async () => {
    const confirmation = useParentalGate.getState().request("Protected action");
    const challenge = useParentalGate.getState().challenge;

    expect(challenge).not.toBeNull();
    expect(useParentalGate.getState().answer("0")).toBe(false);
    expect(useParentalGate.getState().challenge).not.toBeNull();

    const total = (challenge?.left ?? 0) + (challenge?.right ?? 0);
    expect(useParentalGate.getState().answer(String(total))).toBe(true);
    await expect(confirmation).resolves.toBe(true);
    expect(useParentalGate.getState().challenge).toBeNull();
  });

  it("resolves false when the adult cancels", async () => {
    const confirmation = useParentalGate.getState().request("Protected action");
    useParentalGate.getState().cancel();
    await expect(confirmation).resolves.toBe(false);
  });
});
