export function removableStaleUploadPaths(input: {
  ownerId: string;
  uploadPath: string;
  finalPath: string;
  referencedPaths: ReadonlySet<string>;
}): string[] {
  const ownerPrefix = `${input.ownerId}/`;
  const paths = [...new Set([input.uploadPath, input.finalPath])];
  if (paths.some((path) => !path.startsWith(ownerPrefix))) {
    throw new Error("stale_upload_path_invalid");
  }
  return paths.filter((path) => !input.referencedPaths.has(path));
}
