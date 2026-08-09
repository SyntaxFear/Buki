import { File } from "expo-file-system";
import { deleteAsync } from "expo-file-system/legacy";

export async function deleteLocalFile(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (!file.exists) return;
    file.delete();
    return;
  } catch {}

  try {
    await deleteAsync(uri, { idempotent: true });
  } catch {}
}
