import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("expo-router/head", () => {
  const React = require("react");

  return function MockHead({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  };
});

jest.mock("expo-router", () => {
  const React = require("react");

  return {
    Link: ({ children, href, onPress }: Record<string, unknown>) => {
      const child = React.Children.only(children);
      return React.cloneElement(child, {
        href,
        ...(onPress ? { onPress } : {}),
      });
    },
  };
});

jest.mock("@/components/buki-wordmark", () => ({
  BukiWordmark: "BukiWordmark",
}));

import { PublicLandingScreen } from "./landing";

describe("PublicLandingScreen", () => {
  it("keeps the landing hierarchy and responsive review hooks intact", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PublicLandingScreen />);
    });

    const primaryNavigation = renderer.root.find(
      (node) => node.props.dataSet?.publicHeaderNav === "true",
    );
    expect(primaryNavigation.props.accessibilityLabel).toBe("Primary navigation");
    expect(
      renderer.root.findAll(
        (node) => node.props.dataSet?.landing === "screenshot-detail",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      renderer.root.findAll(
        (node) => node.props.dataSet?.landing === "policy-row",
      ).length,
    ).toBeGreaterThanOrEqual(3);

    const headingLevels = renderer.root
      .findAll((node) => node.props.accessibilityRole === "header")
      .map((node) => node.props["aria-level"]);
    expect(headingLevels[0]).toBe(1);
    expect(headingLevels).toEqual(expect.arrayContaining([1, 2, 3]));

    expect(
      renderer.root.findAll((node) => node.props.role === "list").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      renderer.root.findAll((node) => node.props.role === "listitem").length,
    ).toBeGreaterThanOrEqual(9);
  });

  it("ships accessible navigation, prioritized hero imagery, and complete offers", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PublicLandingScreen />);
    });

    expect(
      renderer.root
        .findAll((node) => node.props.dataSet?.publicSkip === "true")
        .some((node) => typeof node.props.onPress === "function"),
    ).toBe(true);
    expect(
      renderer.root.findAll(
        (node) =>
          node.props.href === "/#experience" &&
          typeof node.props.onPress === "function",
      ).length,
    ).toBeGreaterThanOrEqual(2);

    expect(
      renderer.root.findAll(
        (node) =>
          node.props.loading === "eager" && node.props.fetchPriority === "high",
      ).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      renderer.root.findAll((node) => node.props.loading === "lazy").length,
    ).toBeGreaterThan(3);

    const structuredData = renderer.root
      .findAllByType("script")
      .map((node) => node.props.children)
      .find((value) => typeof value === "string" && value.includes("SoftwareApplication"));

    expect(structuredData).toContain("Buki Pro Monthly");
    expect(structuredData).toContain("Buki Pro Yearly");
    expect(structuredData).toContain("Buki Pro Lifetime");
  });
});
