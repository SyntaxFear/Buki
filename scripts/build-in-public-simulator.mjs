#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_ENV = path.join(ROOT, ".env.build-in-public.local");
if (existsSync(LOCAL_ENV)) process.loadEnvFile(LOCAL_ENV);
export const BUKI_BUNDLE_ID = "com.parastashvili.bloombook";
export const DISPOSABLE_SIMULATOR = Object.freeze({
  udid: "83382C8C-B573-44BB-8DB6-CBFD6E24E608",
  name: "Buki-PageFlip-Debug-Disposable-20260813",
});
const SEED_DATA_DIRECTORIES = new Set(["Documents", "Library", "tmp"]);

function parseArgs(argv) {
  const options = { verify: true, reset: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--verify") options.verify = true;
    else if (arg === "--reset") {
      options.reset = true;
      options.verify = false;
    } else if (arg === "--confirm-disposable") options.confirmDisposable = true;
    else if (arg === "--simulator") options.simulatorId = argv[++index];
    else if (arg === "--app") options.appPath = argv[++index];
    else if (arg === "--seed-container") options.seedContainer = argv[++index];
    else if (arg === "--receipt") options.receiptPath = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.trim();
}

async function exists(file) {
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function simulatorRecord() {
  const listing = JSON.parse(run("xcrun", ["simctl", "list", "devices", "-j"]));
  return Object.values(listing.devices)
    .flat()
    .find((device) => device.udid === DISPOSABLE_SIMULATOR.udid);
}

async function seedMarker(seedContainer) {
  const markerPath = path.join(seedContainer, ".buki-synthetic-seed.json");
  if (!(await exists(markerPath)))
    throw new Error(`Synthetic seed marker is missing: ${markerPath}`);
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  if (
    marker.syntheticOnly !== true ||
    marker.bundleId !== BUKI_BUNDLE_ID ||
    marker.simulatorName !== DISPOSABLE_SIMULATOR.name ||
    !/^[a-f0-9]{64}$/i.test(marker.seedSha256 ?? "")
  )
    throw new Error("Synthetic seed marker does not match the approved Buki simulator.");
  const entries = await readdir(seedContainer);
  const unexpected = entries.filter(
    (entry) => entry !== ".buki-synthetic-seed.json" && !SEED_DATA_DIRECTORIES.has(entry),
  );
  if (unexpected.length)
    throw new Error(`Synthetic seed contains unsupported root entries: ${unexpected.join(", ")}.`);
  const actualSeedHash = await hashSeedPayload(seedContainer);
  if (actualSeedHash !== marker.seedSha256.toLowerCase())
    throw new Error("Synthetic seed payload hash does not match its immutable marker.");
  return marker;
}

async function hashSeedPayload(seedContainer) {
  const records = [];
  async function visit(absolutePath, relativePath) {
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink()) throw new Error(`Synthetic seed may not contain symlinks: ${relativePath}.`);
    if (info.isDirectory()) {
      records.push(`directory:${relativePath}`);
      const children = await readdir(absolutePath);
      for (const child of children.sort())
        await visit(path.join(absolutePath, child), path.posix.join(relativePath, child));
      return;
    }
    if (!info.isFile()) throw new Error(`Unsupported synthetic seed entry: ${relativePath}.`);
    const digest = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
    records.push(`file:${relativePath}:${digest}`);
  }
  for (const rootEntry of [...SEED_DATA_DIRECTORIES].sort()) {
    const absolutePath = path.join(seedContainer, rootEntry);
    if (await exists(absolutePath)) await visit(absolutePath, rootEntry);
  }
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

export async function verifyDisposableSimulator({ appPath, seedContainer } = {}) {
  const errors = [];
  const device = simulatorRecord();
  if (!device) errors.push(`Simulator ${DISPOSABLE_SIMULATOR.udid} does not exist.`);
  else {
    if (device.name !== DISPOSABLE_SIMULATOR.name)
      errors.push(`Simulator name is ${device.name}; expected ${DISPOSABLE_SIMULATOR.name}.`);
    if (!device.isAvailable) errors.push("Disposable simulator is unavailable.");
  }
  if (!appPath) errors.push("BIP_SIMULATOR_APP_PATH or --app is required.");
  else if (!(await exists(path.resolve(appPath)))) errors.push(`Simulator app is missing: ${appPath}.`);
  else if (!String(appPath).endsWith(".app") || !(await stat(path.resolve(appPath))).isDirectory())
    errors.push(`Simulator app must be a .app bundle directory: ${appPath}.`);
  if (!seedContainer)
    errors.push("BIP_SIMULATOR_SEED_CONTAINER or --seed-container is required.");
  else {
    try {
      await seedMarker(path.resolve(seedContainer));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { ready: errors.length === 0, errors, device: device ?? null };
}

async function resetSimulator(options) {
  if (!options.confirmDisposable)
    throw new Error("--confirm-disposable is required for a simulator reset.");
  if (options.simulatorId !== DISPOSABLE_SIMULATOR.udid)
    throw new Error(`Only ${DISPOSABLE_SIMULATOR.udid} may be reset.`);
  const rawAppPath = options.appPath ?? process.env.BIP_SIMULATOR_APP_PATH;
  const rawSeedContainer = options.seedContainer ?? process.env.BIP_SIMULATOR_SEED_CONTAINER;
  const appPath = rawAppPath ? path.resolve(rawAppPath) : undefined;
  const seedContainer = rawSeedContainer ? path.resolve(rawSeedContainer) : undefined;
  const verification = await verifyDisposableSimulator({ appPath, seedContainer });
  if (!verification.ready) throw new Error(verification.errors.join(" | "));

  const marker = await seedMarker(seedContainer);
  const device = verification.device;
  if (device.state !== "Booted") {
    run("xcrun", ["simctl", "boot", DISPOSABLE_SIMULATOR.udid]);
    run("xcrun", ["simctl", "bootstatus", DISPOSABLE_SIMULATOR.udid, "-b"], {
      timeout: 120000,
    });
  }
  spawnSync("xcrun", [
    "simctl",
    "terminate",
    DISPOSABLE_SIMULATOR.udid,
    BUKI_BUNDLE_ID,
  ]);
  spawnSync("xcrun", [
    "simctl",
    "uninstall",
    DISPOSABLE_SIMULATOR.udid,
    BUKI_BUNDLE_ID,
  ]);
  run("xcrun", ["simctl", "install", DISPOSABLE_SIMULATOR.udid, appPath]);
  const dataContainer = run("xcrun", [
    "simctl",
    "get_app_container",
    DISPOSABLE_SIMULATOR.udid,
    BUKI_BUNDLE_ID,
    "data",
  ]);
  const resolvedContainer = path.resolve(dataContainer);
  if (!resolvedContainer.includes(`/CoreSimulator/Devices/${DISPOSABLE_SIMULATOR.udid}/data/`))
    throw new Error(`Refusing unexpected simulator container: ${resolvedContainer}`);

  for (const entry of SEED_DATA_DIRECTORIES)
    await rm(path.join(resolvedContainer, entry), { recursive: true, force: true });
  for (const entry of SEED_DATA_DIRECTORIES) {
    const source = path.join(seedContainer, entry);
    if (!(await exists(source))) continue;
    await cp(source, path.join(resolvedContainer, entry), {
      recursive: true,
      force: true,
    });
  }

  const databasePath = path.join(resolvedContainer, "Documents", "SQLite", "buki.db");
  if (await exists(databasePath)) {
    const filePrefix = `file://${resolvedContainer.replaceAll("'", "''")}/`;
    run("sqlite3", [
      databasePath,
      `UPDATE artworks SET cutout_uri = replace(cutout_uri, 'buki-seed://', '${filePrefix}'), photo_uri = replace(photo_uri, 'buki-seed://', '${filePrefix}'), preview_uri = replace(preview_uri, 'buki-seed://', '${filePrefix}'); UPDATE media_files SET local_uri = replace(local_uri, 'buki-seed://', '${filePrefix}');`,
    ]);
  }

  const receipt = {
    schemaVersion: 1,
    resetAt: new Date().toISOString(),
    simulator: DISPOSABLE_SIMULATOR,
    bundleId: BUKI_BUNDLE_ID,
    appPath,
    seedContainer,
    seedId: marker.seedId ?? null,
    syntheticOnly: true,
    scope: "Buki app data only",
  };
  const receiptPath = path.resolve(
    options.receiptPath ??
      path.join(
        ROOT,
        "docs",
        "build-in-public-assets",
        "weekly-x",
        "simulator-reset-latest.json",
      ),
  );
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`Reset Buki only on ${DISPOSABLE_SIMULATOR.name}.\n`);
  process.stdout.write(`Receipt: ${path.relative(ROOT, receiptPath)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const appPath = options.appPath ?? process.env.BIP_SIMULATOR_APP_PATH;
  const seedContainer = options.seedContainer ?? process.env.BIP_SIMULATOR_SEED_CONTAINER;
  if (options.reset) return resetSimulator({ ...options, appPath, seedContainer });
  const verification = await verifyDisposableSimulator({ appPath, seedContainer });
  process.stdout.write(`${verification.ready ? "READY" : "BLOCKED"}\n`);
  for (const error of verification.errors) process.stdout.write(`- ${error}\n`);
  if (!verification.ready) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
