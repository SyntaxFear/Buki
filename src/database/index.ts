import type { SQLiteDatabase } from "expo-sqlite";

import type { StoreData } from "@/store/migrate";
import { BUKI_DATABASE_NAME } from "./constants";
import { migrateLegacyJson } from "./legacy-migration";
import { loadLibrary, saveLibrary } from "./library-repository";
import { migrateDatabaseSchema } from "./schema";
import {
  activateLocalAccount,
  clearActiveLocalAccount,
  getLocalAdultProfile,
} from "./account-repository";
import type { User } from "@supabase/supabase-js";

export { BUKI_DATABASE_NAME };

let activeDatabase: SQLiteDatabase | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function initializeBukiDatabase(db: SQLiteDatabase): Promise<void> {
  activeDatabase = db;
  await migrateDatabaseSchema(db);
  await migrateLegacyJson(db);
}

export function requireBukiDatabase(): SQLiteDatabase {
  if (!activeDatabase) throw new Error("Buki database is not initialized");
  return activeDatabase;
}

export function activateBukiAccount(user: User): Promise<void> {
  return activateLocalAccount(requireBukiDatabase(), user);
}

export function clearBukiAccount(): Promise<void> {
  return clearActiveLocalAccount(requireBukiDatabase());
}

export function loadAdultProfile(ownerId: string) {
  return getLocalAdultProfile(requireBukiDatabase(), ownerId);
}

export function loadLibrarySnapshot(): Promise<StoreData> {
  return loadLibrary(requireBukiDatabase());
}

export function enqueueLibrarySnapshot(data: StoreData): void {
  writeQueue = writeQueue
    .then(() => saveLibrary(requireBukiDatabase(), data))
    .catch((error) => {
      console.warn("Failed to persist Buki library", error);
    });
}

export async function flushLibraryWrites(): Promise<void> {
  await writeQueue;
}
