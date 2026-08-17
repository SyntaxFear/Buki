import { Alert } from "react-native";

import { confirmAdult } from "@/store/parental-gate";
import { Haptics, notificationHaptic } from "@/utils/haptics";

interface ArtworkDeletionDependencies {
  confirm: (reason: string) => Promise<boolean>;
  showAlert: typeof Alert.alert;
}

const DEFAULT_DEPENDENCIES: ArtworkDeletionDependencies = {
  confirm: confirmAdult,
  showAlert: Alert.alert,
};

export async function requestArtworkDeletion(
  artworkId: string,
  deleteDrawing: (id: string) => boolean,
  onDeleted: () => void,
  dependencies: ArtworkDeletionDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const confirmed = await dependencies.confirm(
    "Deleting artwork permanently removes its saved image files from this device.",
  );
  if (!confirmed) return;

  notificationHaptic(Haptics.NotificationFeedbackType.Warning);

  dependencies.showAlert(
    "Delete this artwork?",
    "This cannot be undone on this device.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (deleteDrawing(artworkId)) onDeleted();
        },
      },
    ],
  );
}
