import {
  assertExpectedOwner,
  assertRecentAuthentication,
  HttpError,
} from "./buki.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("expected owner accepts the authenticated account", () => {
  assertExpectedOwner({ ownerId: "adult-a" }, "adult-a");
});

Deno.test("expected owner rejects a session that changed accounts", () => {
  let caught: unknown;
  try {
    assertExpectedOwner({ ownerId: "adult-a" }, "adult-b");
  } catch (error) {
    caught = error;
  }
  assert(
    caught instanceof HttpError,
    "expected an HTTP account mismatch error",
  );
  assert(caught.status === 409, "expected account mismatch to be a conflict");
  assert(
    caught.code === "account_session_changed",
    "expected stable mismatch code",
  );
});

Deno.test("expected owner remains backward compatible when omitted", () => {
  assertExpectedOwner({}, "adult-a");
});

Deno.test("expected owner rejects malformed account identifiers", () => {
  let caught: unknown;
  try {
    assertExpectedOwner({ ownerId: 42 }, "adult-a");
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof HttpError, "expected a malformed owner error");
  assert(caught.status === 400, "expected a malformed request response");
  assert(caught.code === "invalid_ownerId", "expected stable validation code");
});

Deno.test("recent authentication accepts a fresh provider sign-in", () => {
  assertRecentAuthentication(
    { last_sign_in_at: "2026-08-09T16:00:00.000Z" },
    Date.parse("2026-08-09T16:09:59.000Z"),
  );
});

Deno.test("recent authentication rejects stale or invalid sign-ins", () => {
  for (const last_sign_in_at of ["2026-08-09T15:49:59.000Z", undefined, "invalid"]) {
    let caught: unknown;
    try {
      assertRecentAuthentication(
        { last_sign_in_at },
        Date.parse("2026-08-09T16:00:00.000Z"),
      );
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof HttpError, "expected recent authentication error");
    assert(caught.code === "recent_authentication_required", "expected stable auth age code");
  }
});
