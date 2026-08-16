const mockPerformAndroidHapticsAsync = jest.fn(
  async (_type: string) => undefined,
);

jest.mock("expo-haptics", () => ({
  AndroidHaptics: {
    Confirm: "confirm",
    Reject: "reject",
    Gesture_Start: "gesture-start",
    Gesture_End: "gesture-end",
    Context_Click: "context-click",
    Long_Press: "long-press",
    Virtual_Key: "virtual-key",
    Segment_Tick: "segment-tick",
  },
  performAndroidHapticsAsync: (type: string) =>
    mockPerformAndroidHapticsAsync(type),
}));

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (callback: (...args: unknown[]) => unknown, ...args: unknown[]) =>
    callback(...args),
}));

import {
  Haptics,
  impactHaptic,
  notificationHaptic,
  pageTurnBoundaryHaptic,
  pageTurnCrestHaptic,
  selectionHaptic,
  startPageTurnHaptic,
  stopPageTurnHaptic,
  syncHapticsEnabled,
} from "./haptics.android";

describe("Android haptic patterns", () => {
  let now = 1000;

  beforeAll(() => {
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });

  beforeEach(() => {
    now += 1000;
    syncHapticsEnabled(true);
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("uses semantic Android haptics for button impacts and selections", () => {
    impactHaptic(Haptics.ImpactFeedbackStyle.Light);
    now += 1000;
    impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    now += 1000;
    selectionHaptic();

    expect(mockPerformAndroidHapticsAsync.mock.calls).toEqual([
      ["virtual-key"],
      ["context-click"],
      ["segment-tick"],
    ]);
  });

  it("maps success, warning, and error notifications semantically", () => {
    notificationHaptic(Haptics.NotificationFeedbackType.Success);
    notificationHaptic(Haptics.NotificationFeedbackType.Warning);
    notificationHaptic(Haptics.NotificationFeedbackType.Error);

    expect(mockPerformAndroidHapticsAsync.mock.calls).toEqual([
      ["confirm"],
      ["context-click"],
      ["reject"],
    ]);
  });

  it("provides start, crest, and end feedback for page-turn gestures", () => {
    startPageTurnHaptic();
    pageTurnCrestHaptic();
    stopPageTurnHaptic();

    expect(mockPerformAndroidHapticsAsync.mock.calls).toEqual([
      ["gesture-start"],
      ["segment-tick"],
      ["gesture-end"],
    ]);
  });

  it("uses reject feedback for a blocked page-turn boundary", () => {
    pageTurnBoundaryHaptic();

    expect(mockPerformAndroidHapticsAsync).toHaveBeenCalledWith("reject");
  });

  it("suppresses app-generated Android feedback when disabled", () => {
    syncHapticsEnabled(false);

    impactHaptic(Haptics.ImpactFeedbackStyle.Heavy);
    selectionHaptic();
    notificationHaptic(Haptics.NotificationFeedbackType.Error);
    startPageTurnHaptic();
    pageTurnBoundaryHaptic();

    expect(mockPerformAndroidHapticsAsync).not.toHaveBeenCalled();
  });
});
