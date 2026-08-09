import type { BukiArchiveManifest } from "./format";
import { emptyPadSignature, planBukiArchiveImport } from "./import-plan";

const base: BukiArchiveManifest = {
  format: "buki-library-archive",
  version: 1,
  exportedAt: "2026-08-08T12:00:00.000Z",
  appVersion: "1.0.1",
  children: [{ id: "child-a", name: "Ava", avatarColor: "#FFD65A", birthMonth: null, birthYear: null, createdAt: 1 }],
  sketchpads: [{ id: "pad-a", childId: "child-a", name: "My Book", style: "spread", design: "sunshine", border: "none", decoration: "none", coverColor: "#4A79D8", pageColor: "#FFFDF4", createdAt: 2 }],
  artworks: [
    { id: "art-a", sketchpadId: "pad-a", width: 10, height: 10, rotation: 0, addedAt: 3, updatedAt: 3, title: null, notes: null, favorite: false, tags: [], cutout: { path: "media/artwork-a/cutout.png", checksum: "a".repeat(64), byteSize: 10, mimeType: "image/png" }, original: null },
    { id: "art-b", sketchpadId: "pad-a", width: 10, height: 10, rotation: 0, addedAt: 4, updatedAt: 4, title: null, notes: null, favorite: false, tags: [], cutout: { path: "media/artwork-b/cutout.png", checksum: "b".repeat(64), byteSize: 10, mimeType: "image/png" }, original: null },
  ],
};

describe("Buki archive import plan", () => {
  it("assigns fresh IDs, renames colliding children, and skips checksum duplicates", () => {
    let next = 0;
    const plan = planBukiArchiveImport(
      base,
      { childNames: ["Ava"], emptyPadSignatures: [], artworkChecksums: ["a".repeat(64)] },
      () => `new-${++next}`,
    );
    expect(plan.duplicatesSkipped).toBe(1);
    expect(plan.children).toHaveLength(1);
    expect(plan.children[0].name).toBe("Ava (Imported)");
    expect(plan.children[0].id).toBe("new-1");
    expect(plan.children[0].pads[0].id).toBe("new-2");
    expect(plan.children[0].pads[0].artworks).toHaveLength(1);
    expect(plan.children[0].pads[0].artworks[0].source.id).toBe("art-b");
  });

  it("normalizes child and empty-pad names deterministically", () => {
    let next = 0;
    const normalized = {
      ...base,
      children: [{ ...base.children[0], name: "  Ａva   Marie  " }],
      sketchpads: [{ ...base.sketchpads[0], name: "  My   Book  " }],
      artworks: [],
    };
    const signature = emptyPadSignature(
      normalized.children[0].createdAt,
      { ...normalized.sketchpads[0], name: "My Book" },
    );
    const plan = planBukiArchiveImport(
      normalized,
      {
        childNames: ["ava marie"],
        emptyPadSignatures: [signature],
        artworkChecksums: [],
      },
      () => `new-${++next}`,
    );

    expect(plan.children).toEqual([]);
  });

  it("does not create empty structures when every artwork is already present", () => {
    const plan = planBukiArchiveImport(
      base,
      { childNames: [], emptyPadSignatures: [], artworkChecksums: ["a".repeat(64), "b".repeat(64)] },
      () => "unused",
    );
    expect(plan.children).toEqual([]);
    expect(plan.duplicatesSkipped).toBe(2);
  });

  it("preserves a new empty pad once and skips its exact repeated import", () => {
    const empty = { ...base, artworks: [] };
    const first = planBukiArchiveImport(empty, { childNames: [], emptyPadSignatures: [], artworkChecksums: [] }, () => "id");
    expect(first.children).toHaveLength(1);
    const signature = emptyPadSignature(empty.children[0].createdAt, empty.sketchpads[0]);
    const repeated = planBukiArchiveImport(empty, { childNames: ["Ava (Imported)"], emptyPadSignatures: [signature], artworkChecksums: [] }, () => "id");
    expect(repeated.children).toEqual([]);
  });

  it("reports archive artwork whose cutout was unavailable during export", () => {
    const missing = {
      ...base,
      artworks: [{ ...base.artworks[0], cutout: null, original: null }],
    };
    const plan = planBukiArchiveImport(missing, { childNames: [], emptyPadSignatures: [], artworkChecksums: [] }, () => "id");
    expect(plan.children).toEqual([]);
    expect(plan.missingSkipped).toBe(1);
  });
});
