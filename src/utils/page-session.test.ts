import { finalSketchpadUnit, sketchpadUnitImageUris } from "./page-session";

describe("finalSketchpadUnit", () => {
  it("always opens the final add page instead of a previously viewed page", () => {
    expect(finalSketchpadUnit(6, "vertical")).toBe(6);
    expect(finalSketchpadUnit(6, "spread")).toBe(3);
  });

  it("keeps a partially filled multi-slot page as the final add page", () => {
    expect(finalSketchpadUnit(3, "grid")).toBe(0);
    expect(finalSketchpadUnit(4, "grid")).toBe(1);
  });

  it("starts an empty sketchpad at its first page", () => {
    expect(finalSketchpadUnit(0, "vertical")).toBe(0);
  });
});

describe("sketchpadUnitImageUris", () => {
  const drawings = [
    { uri: "file:///one.png" },
    { uri: "file:///two.png" },
    { uri: "file:///three.png" },
  ];

  it("returns every image visible on a multi-slot final page", () => {
    expect(sketchpadUnitImageUris(drawings, 0, "grid")).toEqual([
      "file:///one.png",
      "file:///two.png",
      "file:///three.png",
    ]);
  });

  it("returns no images for a fully empty final page", () => {
    expect(sketchpadUnitImageUris(drawings, 3, "vertical")).toEqual([]);
  });
});
