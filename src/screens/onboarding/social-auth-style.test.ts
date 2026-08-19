import {
  SOCIAL_AUTH_BUTTON_HEIGHT,
  SOCIAL_AUTH_ICON_SIZE,
  SOCIAL_AUTH_LABEL_ALLOW_FONT_SCALING,
  SOCIAL_AUTH_LABEL_FONT_SIZE,
  SOCIAL_AUTH_LABEL_LINE_HEIGHT,
} from "@/layouts/social-auth-layout";

describe("social authentication typography", () => {
  it("keeps the Google title visually aligned with Apple's fixed native title", () => {
    expect(SOCIAL_AUTH_LABEL_FONT_SIZE).toBe(17);
    expect(SOCIAL_AUTH_LABEL_LINE_HEIGHT).toBe(21);
    expect(SOCIAL_AUTH_LABEL_ALLOW_FONT_SCALING).toBe(false);
    expect(SOCIAL_AUTH_ICON_SIZE).toBe(15);
    expect(SOCIAL_AUTH_BUTTON_HEIGHT).toBe(44);
  });
});
