import {
  captureReviewRetryLabel,
  captureReviewTargetUnit,
} from "./capture-review";

describe("capture review placement", () => {
  it.each([
    ["vertical", 3, 3],
    ["album", 3, 3],
    ["spread", 3, 1],
    ["grid", 3, 0],
    ["strip", 3, 1],
  ] as const)(
    "targets the next available %s unit",
    (style, drawingCount, expectedUnit) => {
      expect(captureReviewTargetUnit(drawingCount, style)).toBe(expectedUnit);
    },
  );

  it("uses source-specific retry copy", () => {
    expect(captureReviewRetryLabel("camera")).toBe("Retake");
    expect(captureReviewRetryLabel("gallery")).toBe("Choose another");
    expect(captureReviewRetryLabel("demo")).toBe("Try another");
  });
});
