import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("expo-symbols", () => ({ SymbolView: "SymbolView" }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/components/buki-wordmark", () => ({
  BukiWordmark: "BukiWordmark",
}));
jest.mock("@/store/auth", () => ({
  useAuth: (selector: (state: unknown) => unknown) =>
    selector({ profile: { displayName: "Parent", avatarUri: "emoji:🌻" } }),
}));
jest.mock("@/store/profiles", () => ({
  useProfiles: (selector: (state: unknown) => unknown) =>
    selector({
      activeChildId: "child-a",
      children: [{ id: "child-a", name: "Ava" }],
    }),
}));
jest.mock("@/store/drawings", () => ({
  useDrawings: (selector: (state: unknown) => unknown) =>
    selector({
      pads: [
        {
          id: "pad-a",
          childId: "child-a",
          name: "My Book",
          style: "spread",
          design: "sunshine",
        },
      ],
      activePadId: "pad-a",
      drawingsByPad: { "pad-a": [] },
      setActivePad: jest.fn(),
      renamePad: jest.fn(),
      deletePad: jest.fn(),
    }),
}));
jest.mock("@/store/parental-gate", () => ({
  confirmAdult: jest.fn(async () => true),
}));

import { PadDrawerContent } from "./pad-drawer";

describe("PadDrawer sketchpad editor navigation", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("keeps the drawer open beneath the new-sketchpad form sheet", () => {
    const onClose = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PadDrawerContent onClose={onClose} />);
    });

    act(() => {
      renderer.root
        .findByProps({
          accessibilityLabel: "Create a new sketchpad",
        })
        .props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/sketchpad-editor",
      params: { mode: "create" },
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the drawer open beneath the sketchpad customizer", () => {
    const onClose = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PadDrawerContent onClose={onClose} />);
    });

    act(() => {
      renderer.root
        .findByProps({
          accessibilityLabel: "Edit My Book",
        })
        .props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/sketchpad-editor",
      params: { id: "pad-a", mode: "edit" },
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
