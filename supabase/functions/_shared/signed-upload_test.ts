import {
  copyUploadToFinalPath,
  CREATE_ONLY_SIGNED_UPLOAD_OPTIONS,
} from "./signed-upload.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test("signed uploads are create-only so an occupied source path rejects replay", () => {
  assertEquals(CREATE_ONLY_SIGNED_UPLOAD_OPTIONS, { upsert: false });
});

Deno.test("finalization copies the upload and deliberately retains its source path", async () => {
  const calls: unknown[][] = [];
  await copyUploadToFinalPath(
    {
      async copy(fromPath, toPath) {
        calls.push([fromPath, toPath]);
        return { error: null };
      },
    },
    "adult-a/_uploads/reservation-a",
    "adult-a/media/reservation-a",
  );
  assertEquals(calls, [["adult-a/_uploads/reservation-a", "adult-a/media/reservation-a"]]);
});

Deno.test("finalization surfaces copy failures without deleting the replay guard", async () => {
  let rejected = false;
  try {
    await copyUploadToFinalPath(
      {
        async copy() {
          return { error: new Error("copy failed") };
        },
      },
      "adult-a/_uploads/reservation-a",
      "adult-a/media/reservation-a",
    );
  } catch (error) {
    rejected = error instanceof Error && error.message === "uploaded_object_finalize_failed";
  }
  if (!rejected) throw new Error("Expected a failed copy to reject finalization");
});
