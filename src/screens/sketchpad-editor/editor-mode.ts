export type SketchpadEditorMode = "create" | "edit";

export function firstRouteParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The explicit route mode wins over stale query parameters. This matters for
 * the shared form-sheet route, which is opened repeatedly from the drawer for
 * both creation and editing.
 */
export function resolveSketchpadEditorMode(
  mode: string | undefined,
  padId: string | undefined,
): SketchpadEditorMode {
  if (mode === "create") return "create";
  if (mode === "edit") return "edit";
  return padId ? "edit" : "create";
}
