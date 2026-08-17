import type { ComponentProps } from "react";

const mockImpactHaptic = jest.fn();
const mockNotificationHaptic = jest.fn();
const mockSelectionHaptic = jest.fn();

jest.mock("@/utils/haptics", () => ({
  Haptics: {
    ImpactFeedbackStyle: {
      Rigid: "rigid",
      Heavy: "heavy",
      Medium: "medium",
      Light: "light",
      Soft: "soft",
    },
    NotificationFeedbackType: {
      Error: "error",
      Success: "success",
      Warning: "warning",
    },
  },
  impactHaptic: (...args: unknown[]) => mockImpactHaptic(...args),
  notificationHaptic: (...args: unknown[]) => mockNotificationHaptic(...args),
  selectionHaptic: (...args: unknown[]) => mockSelectionHaptic(...args),
}));

import { HapticPressable } from "./haptic-pressable";

describe("HapticPressable", () => {
  beforeEach(() => jest.clearAllMocks());

  function renderPressable(
    props: ComponentProps<typeof HapticPressable>,
  ) {
    return HapticPressable(props).props;
  }

  it("plays a light impact before the press handler by default", () => {
    const calls: string[] = [];
    mockImpactHaptic.mockImplementation(() => calls.push("haptic"));
    const pressable = renderPressable({ onPress: () => calls.push("press") });

    pressable.onPress({});

    expect(calls).toEqual(["haptic", "press"]);
    expect(mockImpactHaptic).toHaveBeenCalledWith("light");
    expect(mockSelectionHaptic).not.toHaveBeenCalled();
  });

  it("supports semantic warning feedback for destructive actions", () => {
    const pressable = renderPressable({
      haptic: "warning",
      onPress: jest.fn(),
    });

    pressable.onPress({});

    expect(mockNotificationHaptic).toHaveBeenCalledWith("warning");
    expect(mockSelectionHaptic).not.toHaveBeenCalled();
  });

  it("can defer feedback to a successful state-changing handler", () => {
    const onPress = jest.fn();
    const pressable = renderPressable({ haptic: false, onPress });

    pressable.onPress({});

    expect(onPress).toHaveBeenCalled();
    expect(mockImpactHaptic).not.toHaveBeenCalled();
    expect(mockNotificationHaptic).not.toHaveBeenCalled();
    expect(mockSelectionHaptic).not.toHaveBeenCalled();
  });

  it("uses medium impact feedback for long presses by default", () => {
    const onLongPress = jest.fn();
    const pressable = renderPressable({ onLongPress });

    pressable.onLongPress({});

    expect(mockImpactHaptic).toHaveBeenCalledWith("medium");
    expect(onLongPress).toHaveBeenCalled();
  });
});
