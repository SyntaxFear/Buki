import { ArtLibrary } from "@/screens/library";
import { ProtectedChildRoute } from "@/screens/routes/protected-native-route";

export default function LibraryRoute() {
  return (
    <ProtectedChildRoute>
      <ArtLibrary />
    </ProtectedChildRoute>
  );
}
