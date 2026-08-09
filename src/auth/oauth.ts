export interface OAuthCallback {
  code: string | null;
  error: string | null;
}

const CALLBACK_PROTOCOL = "buki:";
const CALLBACK_HOST = "auth";
const CALLBACK_PATH = "/callback";
const UNSAFE_CREDENTIAL_KEYS = ["access_token", "refresh_token", "token_hash", "type"] as const;

export function parseOAuthCallback(url: string): OAuthCallback {
  const parsed = new URL(url);
  if (
    parsed.protocol.toLowerCase() !== CALLBACK_PROTOCOL
    || parsed.hostname.toLowerCase() !== CALLBACK_HOST
    || parsed.pathname !== CALLBACK_PATH
    || parsed.username
    || parsed.password
    || parsed.port
  ) {
    throw new Error("This authentication callback is not valid for Buki.");
  }

  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  if (UNSAFE_CREDENTIAL_KEYS.some((key) => parsed.searchParams.has(key) || fragment.has(key))) {
    throw new Error("Unsolicited authentication credentials are not accepted.");
  }
  const codes = parsed.searchParams.getAll("code");
  if (codes.length > 1) throw new Error("This authentication callback is ambiguous.");

  return {
    code: codes[0] || null,
    error:
      parsed.searchParams.get("error_description")
      ?? parsed.searchParams.get("error")
      ?? fragment.get("error_description")
      ?? fragment.get("error"),
  };
}
