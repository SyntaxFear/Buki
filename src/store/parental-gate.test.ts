const mockAuthenticateAsync = jest.fn();

jest.mock("expo-local-authentication", () => ({
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
}));

import { useParentalGate } from "./parental-gate";

describe("parental confirmation gate", () => {
  beforeEach(() => {
    mockAuthenticateAsync.mockReset().mockResolvedValue({ success: true });
    useParentalGate.setState({
      confirmation: null,
      resolve: null,
      busy: false,
      error: null,
    });
  });

  it("resolves only after iOS confirms the device owner", async () => {
    const confirmation = useParentalGate.getState().request("Protected action");
    expect(useParentalGate.getState().confirmation).toEqual({ reason: "Protected action" });

    await expect(useParentalGate.getState().confirm()).resolves.toBe(true);
    await expect(confirmation).resolves.toBe(true);
    expect(mockAuthenticateAsync).toHaveBeenCalledWith(expect.objectContaining({
      disableDeviceFallback: false,
      fallbackLabel: "Use Device Passcode",
    }));
    expect(useParentalGate.getState().confirmation).toBeNull();
  });

  it("resolves false when the adult cancels", async () => {
    const confirmation = useParentalGate.getState().request("Protected action");
    useParentalGate.getState().cancel();
    await expect(confirmation).resolves.toBe(false);
  });

  it("keeps the protected action pending after a failed device check", async () => {
    mockAuthenticateAsync.mockResolvedValueOnce({ success: false, error: "authentication_failed" });
    const confirmation = useParentalGate.getState().request("Protected action");

    await expect(useParentalGate.getState().confirm()).resolves.toBe(false);
    expect(useParentalGate.getState().confirmation).not.toBeNull();
    expect(useParentalGate.getState().error).toContain("could not confirm");

    useParentalGate.getState().cancel();
    await expect(confirmation).resolves.toBe(false);
  });

  it("ignores a stale authentication result after a newer request replaces it", async () => {
    let finishAuthentication!: (result: { success: true }) => void;
    mockAuthenticateAsync.mockReturnValueOnce(new Promise((resolve) => {
      finishAuthentication = resolve;
    }));
    const firstRequest = useParentalGate.getState().request("First action");
    const firstConfirmation = useParentalGate.getState().confirm();
    const secondRequest = useParentalGate.getState().request("Second action");

    await expect(firstRequest).resolves.toBe(false);
    finishAuthentication({ success: true });
    await expect(firstConfirmation).resolves.toBe(false);
    expect(useParentalGate.getState().confirmation).toEqual({ reason: "Second action" });

    useParentalGate.getState().cancel();
    await expect(secondRequest).resolves.toBe(false);
  });
});
