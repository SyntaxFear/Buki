export function centeredBindingRingPositions(
  origin: number,
  length: number,
  leadingInset: number,
  trailingInset: number,
  spacing = 38,
): number[] {
  const availableLength = Math.max(0, length - leadingInset - trailingInset);
  const count = Math.max(1, Math.ceil(availableLength / spacing));
  const occupiedLength = (count - 1) * spacing;
  const firstPosition = origin + (length - occupiedLength) / 2;

  return Array.from(
    { length: count },
    (_, index) => firstPosition + index * spacing,
  );
}
