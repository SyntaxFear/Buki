import {
  childContentCounts,
  type ChildContentCount,
} from "./child-content-counts";

export interface DrawerChildLike {
  id: string;
  name: string;
  avatarColor: string;
}

export interface DrawerPadLike {
  id: string;
  childId: string;
}

export interface DrawerChildGroup<TPad extends DrawerPadLike> {
  child: DrawerChildLike;
  pads: TPad[];
  counts: ChildContentCount;
}

export function drawerChildGroups<TPad extends DrawerPadLike>(
  children: readonly DrawerChildLike[],
  pads: readonly TPad[],
  drawingsByPad: Readonly<Record<string, readonly unknown[]>>,
  childFilterId: string | null,
): DrawerChildGroup<TPad>[] {
  const counts = childContentCounts(children, pads, drawingsByPad);
  return children
    .filter((child) => childFilterId === null || child.id === childFilterId)
    .map((child) => ({
      child,
      pads: pads.filter((pad) => pad.childId === child.id),
      counts: counts[child.id] ?? { sketchpads: 0, artworks: 0 },
    }));
}
