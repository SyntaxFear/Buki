import { CloudMediaError, isCloudQuotaError } from "./media-upload";

describe("cloud media errors", () => {
  it("identifies quota failures without treating other upload errors as quota failures", () => {
    expect(isCloudQuotaError(new CloudMediaError("full", "cloud_quota_exceeded", 20, 20))).toBe(true);
    expect(isCloudQuotaError(new CloudMediaError("offline", "storage_upload_failed"))).toBe(false);
    expect(isCloudQuotaError(new Error("cloud_quota_exceeded"))).toBe(false);
  });
});
