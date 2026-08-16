import { SketchpadEditorScreen } from "@/screens/sketchpad-editor";
import { ProtectedChildRoute } from "@/screens/routes/protected-native-route";

export default function NativeSketchpadEditorRoute() {
  return (
    <ProtectedChildRoute>
      <SketchpadEditorScreen />
    </ProtectedChildRoute>
  );
}
