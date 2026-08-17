import { firstRouteParam, resolveSketchpadEditorMode } from "./editor-mode";

describe("sketchpad editor route mode", () => {
  it("uses an explicit create intent even if a stale sketchpad id remains", () => {
    expect(resolveSketchpadEditorMode("create", "pad-old")).toBe("create");
  });

  it("keeps edit intent explicit even before its sketchpad is resolved", () => {
    expect(resolveSketchpadEditorMode("edit", undefined)).toBe("edit");
  });

  it("supports existing id-only edit links", () => {
    expect(resolveSketchpadEditorMode(undefined, "pad-a")).toBe("edit");
    expect(resolveSketchpadEditorMode(undefined, undefined)).toBe("create");
  });

  it("normalizes array route parameters", () => {
    expect(firstRouteParam(["edit", "create"])).toBe("edit");
  });
});
