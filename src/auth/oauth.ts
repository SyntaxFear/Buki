export interface OAuthCallback {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  type: string | null;
  error: string | null;
}

export function parseOAuthCallback(url: string): OAuthCallback {
  const parsed = new URL(url);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const value = (key: string) => parsed.searchParams.get(key) ?? fragment.get(key);
  return {
    code: value("code"),
    accessToken: value("access_token"),
    refreshToken: value("refresh_token"),
    tokenHash: value("token_hash"),
    type: value("type"),
    error: value("error_description") ?? value("error"),
  };
}
