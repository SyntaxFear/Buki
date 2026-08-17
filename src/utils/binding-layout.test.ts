import { centeredBindingRingPositions } from "./binding-layout";

describe("centeredBindingRingPositions", () => {
  it("centers the full connector group along the binding edge", () => {
    const positions = centeredBindingRingPositions(100, 460, 30, 22);
    const lastPosition = positions[positions.length - 1];

    expect(positions).toHaveLength(11);
    expect(positions[0]).toBe(140);
    expect(lastPosition).toBe(520);
    expect((positions[0] + lastPosition) / 2).toBe(330);
  });

  it("keeps the existing connector count while balancing uneven edge insets", () => {
    const positions = centeredBindingRingPositions(0, 340, 23, 14);

    expect(positions).toHaveLength(8);
    expect(positions[0]).toBe(37);
    expect(positions[positions.length - 1]).toBe(303);
  });
});
