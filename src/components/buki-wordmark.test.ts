import { bukiTextSegments } from "./buki-wordmark";

describe("Buki brand text segments", () => {
  it("brands standalone Buki mentions regardless of source casing", () => {
    expect(bukiTextSegments("BUKI PRO · Buki archive")).toEqual([
      { brandFont: true, branded: true, text: "BUKI" },
      { brandFont: true, branded: false, text: " PRO · " },
      { brandFont: true, branded: true, text: "Buki" },
      { brandFont: true, branded: false, text: " archive" },
    ]);
  });

  it("keeps surrounding copy and possessive punctuation intact", () => {
    expect(bukiTextSegments("Buki’s private library")).toEqual([
      { brandFont: true, branded: true, text: "Buki" },
      { brandFont: true, branded: false, text: "’s private library" },
    ]);
  });

  it("uses the brand font for the complete phrase containing Buki", () => {
    expect(bukiTextSegments("Discover Buki Pro")).toEqual([
      { brandFont: true, branded: false, text: "Discover " },
      { brandFont: true, branded: true, text: "Buki" },
      { brandFont: true, branded: false, text: " Pro" },
    ]);
  });

  it("does not brand letters embedded inside another word", () => {
    expect(bukiTextSegments("Bukit and rebuking")).toEqual([
      { brandFont: false, branded: false, text: "Bukit and rebuking" },
    ]);
  });
});
