import { DEFAULT_CHILD_ID, DEFAULT_CHILD_NAME } from "./constants";
import type { Drawing, Sketchpad, StoreData } from "@/store/migrate";

export interface LegacyChildRecord {
  id: string;
  name: string;
  avatarColor: string;
  createdAt: number;
}

export interface LegacySketchpadRecord extends Sketchpad {
  childId: string;
  sortOrder: number;
}

export interface LegacyArtworkRecord extends Drawing {
  childId: string;
  sketchpadId: string;
  mediaMissing: boolean;
}

export interface LegacyMigrationRecords {
  child: LegacyChildRecord;
  sketchpads: LegacySketchpadRecord[];
  artworks: LegacyArtworkRecord[];
}

export function buildLegacyMigrationRecords(
  data: StoreData,
  fileExists: (uri: string) => boolean,
): LegacyMigrationRecords {
  const firstCreatedAt = Math.min(...data.pads.map((pad) => pad.createdAt), Date.now());
  const sketchpads = data.pads.map((pad, sortOrder) => ({
    ...pad,
    childId: DEFAULT_CHILD_ID,
    sortOrder,
  }));
  const padById = new Map(sketchpads.map((pad) => [pad.id, pad]));
  const artworks: LegacyArtworkRecord[] = [];

  for (const [sketchpadId, drawings] of Object.entries(data.drawingsByPad)) {
    const pad = padById.get(sketchpadId);
    if (!pad) continue;
    for (const drawing of drawings) {
      artworks.push({
        ...drawing,
        childId: pad.childId,
        sketchpadId,
        mediaMissing: !fileExists(drawing.uri),
      });
    }
  }

  return {
    child: {
      id: DEFAULT_CHILD_ID,
      name: DEFAULT_CHILD_NAME,
      avatarColor: "#FFD65A",
      createdAt: Number.isFinite(firstCreatedAt) ? firstCreatedAt : Date.now(),
    },
    sketchpads,
    artworks,
  };
}
