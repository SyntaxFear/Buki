import React from "react";
import { StyleSheet, Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";

import { PagePagination } from "./page-pagination";

describe("PagePagination", () => {
  it("renders page numbers directly inside the pagination markers", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <PagePagination
          currentUnit={1}
          drawingCount={3}
          style="vertical"
          top={0}
          onSelectUnit={jest.fn()}
        />,
      );
    });

    expect(
      [1, 2, 3, 4].map(
        (page) =>
          renderer.root.findByProps({ testID: `page-number-${page}` }).props
            .children,
      ),
    ).toEqual([1, 2, 3, 4]);

    const activePage = renderer.root.findByProps({ testID: "page-number-2" });
    expect(StyleSheet.flatten(activePage.props.style)).toMatchObject({
      fontFamily: "PatrickHand",
      fontSize: 14,
      fontWeight: "700",
    });

    expect(
      renderer.root
        .findAllByType(Text)
        .some((node) => node.props.children?.join?.("") === "2 of 4"),
    ).toBe(false);
  });

  it("lets the user select another page from its number", () => {
    const onSelectUnit = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <PagePagination
          currentUnit={0}
          drawingCount={3}
          style="vertical"
          top={0}
          onSelectUnit={onSelectUnit}
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({ testID: "page-marker-3" }).props.onPress();
    });

    expect(onSelectUnit).toHaveBeenCalledWith(2);
    expect(
      renderer.root.findByProps({ testID: "page-marker-1" }).props
        .accessibilityState,
    ).toEqual({ selected: true, disabled: true });
  });
});
