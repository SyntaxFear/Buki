import {
  pageFlipShaderProgress,
  pageFlipSharedStateForPhase,
  resolvePageFlipIntent,
} from "./page-flip";

describe("page flip intent", () => {
  it("locks a forward gesture that starts beyond the last page", () => {
    const boundary = resolvePageFlipIntent(-20, 3, 3, false);
    expect(boundary).toEqual({ blocked: true, direction: 0, target: 3 });

    expect(resolvePageFlipIntent(20, 3, 3, boundary.blocked)).toEqual({
      blocked: true,
      direction: 0,
      target: 3,
    });
  });

  it("locks a backward gesture that starts before the first page", () => {
    expect(resolvePageFlipIntent(20, 0, 3, false)).toEqual({
      blocked: true,
      direction: 0,
      target: 0,
    });
  });

  it("allows an in-range page turn", () => {
    expect(resolvePageFlipIntent(-20, 2, 3, false)).toEqual({
      blocked: false,
      direction: 1,
      target: 3,
    });
  });
});

describe("page flip shader progress", () => {
  it("starts both directions on the outgoing page", () => {
    expect(pageFlipShaderProgress(0, 1)).toBe(0);
    expect(pageFlipShaderProgress(0, -1)).toBe(1);
  });

  it("lands both directions on the destination page", () => {
    expect(pageFlipShaderProgress(1, 1)).toBe(1);
    expect(pageFlipShaderProgress(1, -1)).toBe(0);
  });
});

describe("page flip shared-value lifecycle", () => {
  it("keeps the completed frame stable while the native renderer retires", () => {
    expect(pageFlipSharedStateForPhase(1, "retire", 1)).toMatchObject({
      progress: 1,
      locked: 1,
      mounted: 0,
      direction: 1,
    });
  });

  it("keeps reverse shader mapping stable until the renderer is gone", () => {
    const completed = pageFlipSharedStateForPhase(1, "retire", -1);
    expect(completed.direction).toBe(-1);
    expect(
      pageFlipShaderProgress(completed.progress, completed.direction),
    ).toBe(0);

    const cancelled = pageFlipSharedStateForPhase(0, "retire", -1);
    expect(cancelled.direction).toBe(-1);
    expect(
      pageFlipShaderProgress(cancelled.progress, cancelled.direction),
    ).toBe(1);
  });

  it("resets the terminal frame after the retirement paint barrier", () => {
    expect(pageFlipSharedStateForPhase(1, "idle")).toMatchObject({
      progress: 0,
      locked: 0,
      mounted: 0,
    });
  });

  it("keeps progress reset while the next renderer prepares", () => {
    expect(pageFlipSharedStateForPhase(1, "prepare")).toEqual({
      progress: 0,
      locked: 1,
      mounted: 0,
      direction: 0,
      gestureProgress: 0,
      gestureTarget: 0,
      settling: 0,
      crest: 0,
      boundaryBlocked: 0,
    });
  });

  it("keeps a cancelled turn at its zero terminal frame", () => {
    expect(pageFlipSharedStateForPhase(0, "retire").progress).toBe(0);
    expect(pageFlipSharedStateForPhase(0, "idle").progress).toBe(0);
  });
});
