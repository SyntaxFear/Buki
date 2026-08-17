import { Host } from "@expo/ui";
import { Picker, Text } from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier,
  accessibilityLabel,
  frame,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";

import type {
  DrawingViewerMode,
  NativeDrawingModePickerProps,
} from "@/components/native-drawing-mode-picker";
export function NativeDrawingModePicker({
  value,
  onChange,
  style,
}: NativeDrawingModePickerProps) {
  const handleSelection = (selection: DrawingViewerMode) => {
    if (selection !== value) {
      onChange(selection);
    }
  };

  return (
    <Host matchContents colorScheme="dark" style={style}>
      <Picker<DrawingViewerMode>
        label="Image version"
        selection={value}
        onSelectionChange={handleSelection}
        modifiers={[
          pickerStyle("segmented"),
          frame({ width: 196 }),
          accessibilityLabel("Image version: Drawing or Photo"),
          accessibilityIdentifier("drawing-photo-mode-picker"),
        ]}
      >
        <Text modifiers={[tag("drawing")]}>Drawing</Text>
        <Text modifiers={[tag("photo")]}>Photo</Text>
      </Picker>
    </Host>
  );
}
