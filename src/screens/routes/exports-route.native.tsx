import { ExportsScreen } from "@/screens/exports";
import { ProtectedChildRoute } from "@/screens/routes/protected-native-route";

export default function ExportsRoute() {
  return (
    <ProtectedChildRoute>
      <ExportsScreen />
    </ProtectedChildRoute>
  );
}
