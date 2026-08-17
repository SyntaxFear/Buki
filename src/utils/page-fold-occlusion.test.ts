import { bindingFoldOcclusionAlpha } from "./page-fold-occlusion";

describe("binding fold occlusion", () => {
  it("keeps settled binding hardware visible at both endpoints", () => {
    expect(
      bindingFoldOcclusionAlpha({
        progress: 0,
        curl: 0.82,
        cross: 0.9,
        pageExtent: 100,
      }),
    ).toBe(0);
    expect(
      bindingFoldOcclusionAlpha({
        progress: 1,
        curl: 0.82,
        cross: 0.9,
        pageExtent: 100,
      }),
    ).toBe(0);
  });

  it("covers only the connectors crossed by the diagonal folded sheet", () => {
    expect(
      bindingFoldOcclusionAlpha({
        progress: 0.5,
        curl: 0.82,
        cross: 0.2,
        pageExtent: 100,
      }),
    ).toBe(0);
    expect(
      bindingFoldOcclusionAlpha({
        progress: 0.5,
        curl: 0.82,
        cross: 0.9,
        pageExtent: 100,
      }),
    ).toBe(1);
  });
});
