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
  updateLocalAdultProfile,
} from "./account-repository";
import type { User } from "@supabase/supabase-js";
import {
  completeLocalOnboarding,
  createLocalChild,
  deleteLocalChild,
  loadProfileState,
  reorderLocalChildren,
  replayLocalOnboarding,
  setActiveLocalChild,
  updateLocalChild,
  type LocalChildProfile,
} from "./profile-repository";
import {
  getBooleanPreference,
  getLocalUsage,
  setBooleanPreference,
} from "./settings-repository";
import {
  loadLocalEntitlementSnapshot,
  saveLocalEntitlementSnapshot,
} from "./entitlement-repository";
import type { EntitlementSnapshot } from "@/subscription/access";
import {
  mergeImportedArchive,
  type ImportedArchiveLibrary,
} from "./archive-repository";

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

export function editAdultProfile(
  ownerId: string,
  updates: { displayName: string; avatarUri: string | null },
) {
  return updateLocalAdultProfile(requireBukiDatabase(), ownerId, updates);
}

export function loadBukiProfiles() {
  return loadProfileState(requireBukiDatabase());
}

export function finishBukiOnboarding(input: Parameters<typeof completeLocalOnboarding>[1]) {
  return completeLocalOnboarding(requireBukiDatabase(), input);
}

export function addBukiChild(
  child: Omit<LocalChildProfile, "ownerId" | "sortOrder" | "createdAt">,
  defaultPadId: string,
) {
  return createLocalChild(requireBukiDatabase(), child, defaultPadId);
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

export function reorderBukiChildren(orderedIds: string[]) {
  return reorderLocalChildren(requireBukiDatabase(), orderedIds);
}

export function removeBukiChild(childId: string) {
  return deleteLocalChild(requireBukiDatabase(), childId);
}

export function replayBukiOnboarding() {
  return replayLocalOnboarding(requireBukiDatabase());
}

export function loadBooleanPreference(name: string, fallback: boolean) {
  return getBooleanPreference(requireBukiDatabase(), name, fallback);
}

export function saveBooleanPreference(name: string, value: boolean) {
  return setBooleanPreference(requireBukiDatabase(), name, value);
}

export function loadBukiUsage() {
  return getLocalUsage(requireBukiDatabase());
}

export function loadBukiEntitlement(ownerId: string) {
  return loadLocalEntitlementSnapshot(requireBukiDatabase(), ownerId);
}

export function saveBukiEntitlement(ownerId: string, snapshot: EntitlementSnapshot) {
  return saveLocalEntitlementSnapshot(requireBukiDatabase(), ownerId, snapshot);
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

export function importBukiLibraryArchive(imported: ImportedArchiveLibrary) {
  return mergeImportedArchive(requireBukiDatabase(), imported);
}

export type { ImportedArchiveLibrary };
