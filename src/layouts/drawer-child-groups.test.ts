import { drawerChildGroups } from "./drawer-child-groups";

const children = [
  { id: "lina", name: "Lina", avatarColor: "#FF9CB5" },
  { id: "qa", name: "QA", avatarColor: "#FFD75A" },
];
const pads = [
  { id: "lina-one", childId: "lina", name: "Book" },
  { id: "qa-one", childId: "qa", name: "QA Book" },
  { id: "lina-two", childId: "lina", name: "Album" },
  { id: "orphan", childId: "removed", name: "Removed" },
];
const drawings = {
  "lina-one": [{}, {}],
  "lina-two": [{}],
  "qa-one": [],
  orphan: [{}, {}],
};

describe("drawer child groups", () => {
  it("groups every child's sketchpads in profile order", () => {
    expect(drawerChildGroups(children, pads, drawings, null)).toEqual([
      {
        child: children[0],
        pads: [pads[0], pads[2]],
        counts: { sketchpads: 2, artworks: 3 },
      },
      {
        child: children[1],
        pads: [pads[1]],
        counts: { sketchpads: 1, artworks: 0 },
      },
    ]);
  });

  it("filters to one child without including orphan sketchpads", () => {
    expect(drawerChildGroups(children, pads, drawings, "qa")).toEqual([
      {
        child: children[1],
        pads: [pads[1]],
        counts: { sketchpads: 1, artworks: 0 },
      },
    ]);
  });
});
