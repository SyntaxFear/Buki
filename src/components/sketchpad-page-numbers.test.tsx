import {
  PAGE_FOLIO_EDGES,
  pageFolioPosition,
} from "@/utils/page-folio";

const page = { x: 40, y: 100, width: 280, height: 420 };

describe("pageFolioPosition", () => {
  it("uses the outer edge for every sketchpad page surface", () => {
    expect(PAGE_FOLIO_EDGES).toEqual({
      single: "right",
      spreadLeft: "left",
      spreadRight: "right",
    });
  });

  it("places a left folio beside the page stamp", () => {
    expect(pageFolioPosition(page, "left", 12, 4)).toEqual({
      x: 86,
      y: 509,
    });
  });

  it("places a right folio inside the opposite paper edge", () => {
    expect(pageFolioPosition(page, "right", 12, 4)).toEqual({
      x: 290,
      y: 509,
    });
  });
});
