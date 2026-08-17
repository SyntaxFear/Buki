import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockSetHapticsEnabled = jest.fn();
const mockStopAllHaptics = jest.fn();
const mockStopContinuousPlayer = jest.fn();
const mockCreateContinuousPlayer = jest.fn();
const mockDestroyContinuousPlayer = jest.fn();
const mockStartContinuousPlayer = jest.fn();
const mockUpdateContinuousPlayer = jest.fn();
const mockTriggerImpact = jest.fn();
const mockTriggerNotification = jest.fn();
const mockTriggerSelection = jest.fn();
const mockScheduleOnUI = jest.fn(
  (_worklet: (...args: unknown[]) => unknown, _args: unknown[]) => undefined,
);

jest.mock("react-native-worklets", () => ({
  scheduleOnUI: (
    worklet: (...args: unknown[]) => unknown,
    ...args: unknown[]
  ) => {
    mockScheduleOnUI(worklet, args);
    return worklet(...args);
  },
}));

jest.mock("@renegades/react-native-tickle", () => ({
  createContinuousPlayer: (...args: unknown[]) =>
    mockCreateContinuousPlayer(...args),
  destroyContinuousPlayer: (...args: unknown[]) =>
    mockDestroyContinuousPlayer(...args),
  destroyEngine: jest.fn(),
  initializeEngine: jest.fn(),
  setHapticsEnabled: (...args: unknown[]) => mockSetHapticsEnabled(...args),
  startContinuousPlayer: (...args: unknown[]) =>
    mockStartContinuousPlayer(...args),
  stopAllHaptics: (...args: unknown[]) => mockStopAllHaptics(...args),
  stopContinuousPlayer: (...args: unknown[]) =>
    mockStopContinuousPlayer(...args),
  updateContinuousPlayer: (...args: unknown[]) =>
    mockUpdateContinuousPlayer(...args),
  triggerImpact: (...args: unknown[]) => mockTriggerImpact(...args),
  triggerNotification: (...args: unknown[]) =>
    mockTriggerNotification(...args),
  triggerSelection: (...args: unknown[]) => mockTriggerSelection(...args),
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
  updatePageTurnHaptic,
  usePageTurnHaptics,
} from "./haptics.ios";

function PageTurnHapticsHarness() {
  usePageTurnHaptics();
  return null;
}

describe("Tickle haptic patterns", () => {
  let now = 1000;

  beforeAll(() => {
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });

  beforeEach(() => {
    now += 1000;
    jest.clearAllMocks();
    syncHapticsEnabled(true);
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("uses Tickle's prepared system selection feedback", () => {
    selectionHaptic();

    expect(mockScheduleOnUI).toHaveBeenCalledTimes(1);
    expect(mockTriggerSelection).toHaveBeenCalledTimes(1);
  });

  it("uses Tickle's prepared system impact feedback", () => {
    impactHaptic(Haptics.ImpactFeedbackStyle.Medium);

    expect(mockScheduleOnUI).toHaveBeenCalledTimes(1);
    expect(mockTriggerImpact).toHaveBeenCalledWith("medium");
  });

  it("uses Tickle's semantic system notification feedback", () => {
    notificationHaptic(Haptics.NotificationFeedbackType.Warning);

    expect(mockScheduleOnUI).toHaveBeenCalledTimes(1);
    expect(mockTriggerNotification).toHaveBeenCalledWith("warning");
  });

  it("stops active feedback before disabling the native runtime", () => {
    syncHapticsEnabled(false);

    expect(mockStopContinuousPlayer).toHaveBeenCalledWith(
      "buki-sketchpad-page-turn",
    );
    expect(mockStopAllHaptics).toHaveBeenCalled();
    expect(mockSetHapticsEnabled).toHaveBeenCalledWith(false);
  });

  it("does not emit transient feedback while disabled", () => {
    syncHapticsEnabled(false);
    jest.clearAllMocks();

    selectionHaptic();

    expect(mockTriggerSelection).not.toHaveBeenCalled();
  });

  it("debounces duplicate transient feedback from one interaction", () => {
    selectionHaptic();
    selectionHaptic();

    expect(mockTriggerSelection).toHaveBeenCalledTimes(1);

    now += 36;
    selectionHaptic();
    expect(mockTriggerSelection).toHaveBeenCalledTimes(2);
  });

  it("creates and destroys the page-turn player with the strong base values", () => {
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(React.createElement(PageTurnHapticsHarness));
    });

    expect(mockCreateContinuousPlayer).toHaveBeenCalledWith(
      "buki-sketchpad-page-turn",
      1,
      0.5,
    );

    act(() => renderer.unmount());

    expect(mockStopContinuousPlayer).toHaveBeenCalledWith(
      "buki-sketchpad-page-turn",
    );
    expect(mockDestroyContinuousPlayer).toHaveBeenCalledWith(
      "buki-sketchpad-page-turn",
    );
  });

  it("routes page-turn gesture updates through the continuous player", () => {
    startPageTurnHaptic();
    updatePageTurnHaptic(0.31, 0.67);
    stopPageTurnHaptic();

    expect(mockStartContinuousPlayer).toHaveBeenCalledWith(
      "buki-sketchpad-page-turn",
    );
    expect(mockUpdateContinuousPlayer).toHaveBeenCalledWith(
      "buki-sketchpad-page-turn",
      0.31,
      0.67,
    );
    expect(mockStopContinuousPlayer).toHaveBeenCalledWith(
      "buki-sketchpad-page-turn",
    );
  });

  it("uses distinct system impacts for page crest and blocked boundaries", () => {
    pageTurnCrestHaptic();
    pageTurnBoundaryHaptic();

    expect(mockTriggerImpact).toHaveBeenNthCalledWith(1, "rigid");
    expect(mockTriggerImpact).toHaveBeenNthCalledWith(2, "soft");
  });
});
