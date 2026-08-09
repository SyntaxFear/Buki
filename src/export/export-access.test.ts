const mockRequestUpgrade = jest.fn();
let mockExportAllowed = false;

jest.mock("@/store/membership", () => ({
  currentCapabilities: () => ({ exportData: mockExportAllowed }),
  useMembership: {
    getState: () => ({ requestUpgrade: mockRequestUpgrade }),
  },
}));

import { ProFeatureRequiredError } from "@/subscription/access";
import { requireExportAccess } from "./export-access";

describe("export capability boundary", () => {
  beforeEach(() => {
    mockExportAllowed = false;
    mockRequestUpgrade.mockReset();
  });

  it("blocks direct Free export calls and requests the paywall", () => {
    expect(() => requireExportAccess("sketchpad_pdf_export")).toThrow(
      new ProFeatureRequiredError("exportData"),
    );
    expect(mockRequestUpgrade).toHaveBeenCalledWith(
      "exportData",
      "sketchpad_pdf_export",
    );
  });

  it("allows Pro export calls without requesting an upgrade", () => {
    mockExportAllowed = true;

    expect(() => requireExportAccess("sketchpad_pdf_export")).not.toThrow();
    expect(mockRequestUpgrade).not.toHaveBeenCalled();
  });
});
