import { historyItemsContainPro, revenueCatPagePath } from "./revenuecat.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("historical access recognizes the Pro entitlement by lookup key", () => {
  assert(
    historyItemsContainPro([
      {
        id: "subscription-1",
        entitlements: { items: [{ id: "old-id", lookup_key: "pro" }] },
      },
    ], "current-pro-id"),
    "expected Pro history to be recognized",
  );
});

Deno.test("historical access recognizes the Pro entitlement by RevenueCat id", () => {
  assert(
    historyItemsContainPro([
      {
        id: "purchase-1",
        entitlements: {
          items: [{ id: "current-pro-id", lookup_key: "legacy-key" }],
        },
      },
    ], "current-pro-id"),
    "expected matching entitlement id to be recognized",
  );
});

Deno.test("historical access rejects unrelated purchases", () => {
  assert(
    !historyItemsContainPro([
      {
        id: "purchase-2",
        entitlements: { items: [{ id: "other-id", lookup_key: "other" }] },
      },
    ], "current-pro-id"),
    "unrelated history must not start Pro retention",
  );
});

Deno.test("pagination follows RevenueCat's returned v2 URL", () => {
  assert(
    revenueCatPagePath(
      "/v2/projects/project-1/customers/customer-1/subscriptions?starting_after=sub-1",
    ) ===
      "/projects/project-1/customers/customer-1/subscriptions?starting_after=sub-1",
    "expected the documented next_page URL to be normalized",
  );
});

Deno.test("pagination accepts internally constructed project paths", () => {
  assert(
    revenueCatPagePath("/projects/project-1/entitlements?limit=100") ===
      "/projects/project-1/entitlements?limit=100",
    "expected internal RevenueCat paths to remain stable",
  );
});

Deno.test("pagination rejects external URLs before sending the secret", () => {
  let rejected = false;
  try {
    revenueCatPagePath("https://example.com/v2/projects/project-1/customers");
  } catch {
    rejected = true;
  }
  assert(rejected, "expected an external pagination URL to be rejected");
});
