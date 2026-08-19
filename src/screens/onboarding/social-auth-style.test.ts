import {
  SOCIAL_AUTH_BUTTON_HEIGHT,
  SOCIAL_AUTH_LABEL_FONT_SIZE,
} from "@/layouts/social-auth-layout";

describe("social authentication typography", () => {
  it("keeps the Google title aligned with Apple's native 17 point title", () => {
    expect(SOCIAL_AUTH_LABEL_FONT_SIZE).toBe(17);
    expect(SOCIAL_AUTH_BUTTON_HEIGHT).toBe(44);
  });
});
