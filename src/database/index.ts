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
import {
  completeLocalOnboarding,
  createLocalChild,
  loadProfileState,
  setActiveLocalChild,
  updateLocalChild,
  type LocalChildProfile,
} from "./profile-repository";

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

export function loadBukiProfiles() {
  return loadProfileState(requireBukiDatabase());
}

export function finishBukiOnboarding(input: Parameters<typeof completeLocalOnboarding>[1]) {
  return completeLocalOnboarding(requireBukiDatabase(), input);
}

export function addBukiChild(
  child: Omit<LocalChildProfile, "ownerId" | "sortOrder" | "createdAt">,
) {
  return createLocalChild(requireBukiDatabase(), child);
}

export function editBukiChild(
  childId: string,
  updates: Parameters<typeof updateLocalChild>[2],
) {
  return updateLocalChild(requireBukiDatabase(), childId, updates);
}

export function selectBukiChild(childId: string) {
  return setActiveLocalChild(requireBukiDatabase(), childId);
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
