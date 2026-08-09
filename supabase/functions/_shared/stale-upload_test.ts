import { removableStaleUploadPaths } from "./stale-upload.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("stale upload cleanup removes temporary and uncommitted final paths", () => {
  assertEquals(
    removableStaleUploadPaths({
      ownerId: "adult-a",
      uploadPath: "adult-a/_uploads/reservation-a",
      finalPath: "adult-a/media/reservation-a",
      referencedPaths: new Set(),
    }),
    ["adult-a/_uploads/reservation-a", "adult-a/media/reservation-a"],
  );
});

Deno.test("stale upload cleanup preserves a path referenced by uploaded media", () => {
  assertEquals(
    removableStaleUploadPaths({
      ownerId: "adult-a",
      uploadPath: "adult-a/_uploads/reservation-a",
      finalPath: "adult-a/media/reservation-a",
      referencedPaths: new Set(["adult-a/media/reservation-a"]),
    }),
    ["adult-a/_uploads/reservation-a"],
  );
});

Deno.test("stale upload cleanup rejects paths outside the owner prefix", () => {
  let rejected = false;
  try {
    removableStaleUploadPaths({
      ownerId: "adult-a",
      uploadPath: "adult-b/_uploads/reservation-a",
      finalPath: "adult-a/media/reservation-a",
      referencedPaths: new Set(),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error("Expected cross-account cleanup path to be rejected");
  }
});
