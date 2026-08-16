import { Keyboard } from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";

export const keyboardDismissMode =
  process.env.EXPO_OS === "ios" ? ("interactive" as const) : ("on-drag" as const);

// Keep a small breathing space between the focused caret and the system
// keyboard without adding a custom Previous/Next accessory toolbar.
export const keyboardInputBottomOffset = 20;

export function dismissKeyboard(): void {
  Keyboard.dismiss();
  void KeyboardController.dismiss().catch(() => undefined);
}
