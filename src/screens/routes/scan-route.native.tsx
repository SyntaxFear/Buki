import { Scan } from "@/screens/scan";
import { ProtectedChildRoute } from "@/screens/routes/protected-native-route";

export default function ScanRoute() {
  return (
    <ProtectedChildRoute>
      <Scan />
    </ProtectedChildRoute>
  );
}
