import { ProFeatureRequiredError } from "@/subscription/access";
import { currentCapabilities, useMembership } from "@/store/membership";

export function requireExportAccess(source: string): void {
  if (currentCapabilities().exportData) return;
  useMembership.getState().requestUpgrade("exportData", source);
  throw new ProFeatureRequiredError("exportData");
}
