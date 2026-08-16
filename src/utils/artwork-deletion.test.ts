const mockNotificationHaptic = jest.fn();

jest.mock("@/utils/haptics", () => ({
  Haptics: {
    NotificationFeedbackType: {
      Warning: "warning",
    },
  },
  notificationHaptic: (...args: unknown[]) => mockNotificationHaptic(...args),
}));

import { requestArtworkDeletion } from "./artwork-deletion";

describe("requestArtworkDeletion", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stops before the destructive alert when adult confirmation fails", async () => {
    const deleteDrawing = jest.fn(() => true);
    const onDeleted = jest.fn();
    const showAlert = jest.fn();

    await requestArtworkDeletion("art-a", deleteDrawing, onDeleted, {
      confirm: jest.fn(async () => false),
      showAlert,
    });

    expect(showAlert).not.toHaveBeenCalled();
    expect(deleteDrawing).not.toHaveBeenCalled();
    expect(mockNotificationHaptic).not.toHaveBeenCalled();
  });

  it("deletes only after the destructive alert action is confirmed", async () => {
    const deleteDrawing = jest.fn(() => true);
    const onDeleted = jest.fn();
    const showAlert = jest.fn();

    await requestArtworkDeletion("art-a", deleteDrawing, onDeleted, {
      confirm: jest.fn(async () => true),
      showAlert,
    });

    const buttons = showAlert.mock.calls[0][2];
    expect(deleteDrawing).not.toHaveBeenCalled();
    expect(mockNotificationHaptic).toHaveBeenCalledTimes(1);
    expect(mockNotificationHaptic).toHaveBeenCalledWith("warning");
    buttons[1].onPress();
    expect(deleteDrawing).toHaveBeenCalledWith("art-a");
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("keeps the viewer open when deletion no longer finds the artwork", async () => {
    const deleteDrawing = jest.fn(() => false);
    const onDeleted = jest.fn();
    const showAlert = jest.fn();

    await requestArtworkDeletion("art-a", deleteDrawing, onDeleted, {
      confirm: jest.fn(async () => true),
      showAlert,
    });
    showAlert.mock.calls[0][2][1].onPress();

    expect(onDeleted).not.toHaveBeenCalled();
  });
});
