import { ArtworkDetails } from "@/screens/artwork";
import { ProtectedChildRoute } from "@/screens/routes/protected-native-route";

export default function ArtworkRoute() {
  return (
    <ProtectedChildRoute>
      <ArtworkDetails />
    </ProtectedChildRoute>
  );
}
