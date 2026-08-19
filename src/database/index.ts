import type { SQLiteDatabase } from "expo-sqlite";

import type { StoreData } from "@/store/migrate";
import { BUKI_DATABASE_NAME } from "./constants";
import { migrateLegacyJson } from "./legacy-migration";
import { rebaseStoredLocalUris } from "./local-uri";
import { loadLibrary, saveLibrary } from "./library-repository";
import { migrateDatabaseSchema } from "./schema";
import {
  activateLocalAccount,
  clearActiveLocalAccount,
  getActiveLocalAdultProfile,
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
  getSketchpadViewedUnits,
  setBooleanPreference,
  setSketchpadViewedUnit,
} from "./settings-repository";
import {
  loadLocalEntitlementSnapshot,
  saveLocalEntitlementSnapshot,
} from "./entitlement-repository";
import type { Capabilities, EntitlementSnapshot } from "@/subscription/access";
import { notifySyncQueueChanged } from "@/sync/signals";
import {
  mergeImportedArchive,
  type ArchiveImportAccess,
  type ImportedArchiveLibrary,
} from "./archive-repository";
import {
  completeLocalSyncOperations,
  enqueueLocalSyncOperation,
  failLocalSyncOperation,
  getOrCreateLocalSyncDeviceId,
  loadLocalSyncSummary,
  loadReadyLocalSyncOperations,
  markLocalSyncCompleted,
  setLocalAutomaticBackup,
} from "./sync-repository";
import {
  loadLocalMediaFile,
  markLocalMediaFailed,
  markLocalMediaUploaded,
  markLocalMediaUploading,
  saveLocalCloudUsage,
} from "./media-repository";
import {
  applyRemoteCloudSnapshot,
  reconcileLocalTagIdentity,
  type CanonicalRemoteTag,
} from "./cloud-restore-repository";
import type { RemoteCloudSnapshot } from "@/sync/cloud-types";
import { deleteLocalAccountData, resetLocalCloudState } from "./privacy-repository";
import {
  completeAnalyticsEvents,
  enqueueAnalyticsEvent,
  failAnalyticsEvent,
  loadReadyAnalyticsEvents,
} from "./analytics-repository";

export { BUKI_DATABASE_NAME };

let activeDatabase: SQLiteDatabase | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let viewedUnitWriteQueue: Promise<void> = Promise.resolve();

export async function initializeBukiDatabase(db: SQLiteDatabase): Promise<void> {
  activeDatabase = db;
  await migrateDatabaseSchema(db);
  await migrateLegacyJson(db);
  await rebaseStoredLocalUris(db);
}

export function requireBukiDatabase(): SQLiteDatabase {
  if (!activeDatabase) throw new Error("Buki database is not initialized");
  return activeDatabase;
}

export async function activateBukiAccount(user: User): Promise<void> {
  await activateLocalAccount(requireBukiDatabase(), user);
  notifySyncQueueChanged();
}

export function clearBukiAccount(): Promise<void> {
  return clearActiveLocalAccount(requireBukiDatabase());
}

export function loadAdultProfile(ownerId: string) {
  return getLocalAdultProfile(requireBukiDatabase(), ownerId);
}

export function loadActiveAdultProfile() {
  return getActiveLocalAdultProfile(requireBukiDatabase());
}

export function editAdultProfile(
  ownerId: string,
  updates: { displayName: string; avatarUri: string | null },
) {
  return updateLocalAdultProfile(requireBukiDatabase(), ownerId, updates).then(() => {
    notifySyncQueueChanged();
  });
}

export function loadBukiProfiles() {
  return loadProfileState(requireBukiDatabase());
}

export function finishBukiOnboarding(input: Parameters<typeof completeLocalOnboarding>[1]) {
  return completeLocalOnboarding(requireBukiDatabase(), input).then(() => {
    notifySyncQueueChanged();
  });
}

export function addBukiChild(
  child: Omit<LocalChildProfile, "ownerId" | "sortOrder" | "createdAt">,
  defaultPadId: string,
  limits: Parameters<typeof createLocalChild>[3],
) {
  return createLocalChild(requireBukiDatabase(), child, defaultPadId, limits).then(() => {
    notifySyncQueueChanged();
  });
}

export function editBukiChild(
  childId: string,
  updates: Parameters<typeof updateLocalChild>[2],
) {
  return updateLocalChild(requireBukiDatabase(), childId, updates).then(() => {
    notifySyncQueueChanged();
  });
}

export function selectBukiChild(childId: string) {
  return setActiveLocalChild(requireBukiDatabase(), childId);
}

export function reorderBukiChildren(orderedIds: string[]) {
  return reorderLocalChildren(requireBukiDatabase(), orderedIds).then(() => {
    notifySyncQueueChanged();
  });
}

export function removeBukiChild(childId: string) {
  return deleteLocalChild(requireBukiDatabase(), childId).then(() => {
    notifySyncQueueChanged();
  });
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

export function loadSketchpadViewedUnits() {
  return getSketchpadViewedUnits(requireBukiDatabase());
}

export function enqueueSketchpadViewedUnit(padId: string, unit: number): void {
  viewedUnitWriteQueue = viewedUnitWriteQueue
    .then(() => setSketchpadViewedUnit(requireBukiDatabase(), padId, unit))
    .catch((error) => {
      console.warn("Failed to persist Buki page position", error);
    });
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

export function enqueueLibrarySnapshot(
  data: StoreData,
  getCapabilities: () => Capabilities,
  onError?: (error: unknown) => void,
): void {
  writeQueue = writeQueue
    .then(() => saveLibrary(requireBukiDatabase(), data, { getCapabilities }))
    .then(() => notifySyncQueueChanged())
    .catch((error) => {
      onError?.(error);
      console.warn("Failed to persist Buki library", error);
    });
}

export async function flushLibraryWrites(): Promise<void> {
  await Promise.all([writeQueue, viewedUnitWriteQueue]);
}

export async function importBukiLibraryArchive(
  imported: ImportedArchiveLibrary,
  access: ArchiveImportAccess,
) {
  access.assertWriteAllowed();
  const db = requireBukiDatabase();
  const result = await mergeImportedArchive(db, imported, access);
  notifySyncQueueChanged();
  return result;
}

export function loadBukiSyncSummary(ownerId: string) {
  return loadLocalSyncSummary(requireBukiDatabase(), ownerId);
}

export function loadReadyBukiSyncOperations(ownerId: string, now?: number, limit?: number) {
  return loadReadyLocalSyncOperations(requireBukiDatabase(), ownerId, now, limit);
}

export function completeBukiSyncOperations(ownerId: string, ids: string[]) {
  return completeLocalSyncOperations(requireBukiDatabase(), ownerId, ids);
}

export function failBukiSyncOperation(ownerId: string, id: string, error: unknown, now?: number) {
  return failLocalSyncOperation(requireBukiDatabase(), ownerId, id, error, now);
}

export function saveBukiAutomaticBackup(ownerId: string, enabled: boolean) {
  return setLocalAutomaticBackup(requireBukiDatabase(), ownerId, enabled);
}

export function markBukiSyncCompleted(ownerId: string, completedAt: string) {
  return markLocalSyncCompleted(requireBukiDatabase(), ownerId, completedAt);
}

export function getOrCreateBukiSyncDeviceId(generatedId: string) {
  return getOrCreateLocalSyncDeviceId(requireBukiDatabase(), generatedId);
}

export async function enqueueBukiSyncDevice(
  ownerId: string,
  input: { deviceId: string; appVersion: string | null; pushedAt: string },
): Promise<void> {
  await enqueueLocalSyncOperation(requireBukiDatabase(), {
    ownerId,
    operation: "upsert",
    entityType: "sync_device",
    entityId: input.deviceId,
    payload: {
      owner_id: ownerId,
      device_id: input.deviceId,
      platform: "ios",
      app_version: input.appVersion,
      last_pushed_at: input.pushedAt,
    },
  });
}

export function loadBukiLocalMedia(ownerId: string, mediaId: string) {
  return loadLocalMediaFile(requireBukiDatabase(), ownerId, mediaId);
}

export function markBukiMediaUploading(ownerId: string, mediaId: string) {
  return markLocalMediaUploading(requireBukiDatabase(), ownerId, mediaId);
}

export function markBukiMediaUploaded(input: Parameters<typeof markLocalMediaUploaded>[1]) {
  return markLocalMediaUploaded(requireBukiDatabase(), input);
}

export function markBukiMediaFailed(ownerId: string, mediaId: string, mediaMissing: boolean) {
  return markLocalMediaFailed(requireBukiDatabase(), ownerId, mediaId, mediaMissing);
}

export function saveBukiCloudUsage(ownerId: string, bytesUsed: number, bytesLimit: number) {
  return saveLocalCloudUsage(requireBukiDatabase(), ownerId, bytesUsed, bytesLimit);
}

export function restoreBukiCloudSnapshot(ownerId: string, snapshot: RemoteCloudSnapshot) {
  return applyRemoteCloudSnapshot(requireBukiDatabase(), ownerId, snapshot);
}

export async function reconcileBukiTagIdentity(
  ownerId: string,
  localTagId: string,
  remoteTag: CanonicalRemoteTag,
): Promise<void> {
  await reconcileLocalTagIdentity(
    requireBukiDatabase(),
    ownerId,
    localTagId,
    remoteTag,
  );
  notifySyncQueueChanged();
}

export function deleteBukiLocalAccount(ownerId: string) {
  return deleteLocalAccountData(requireBukiDatabase(), ownerId);
}

export function resetBukiCloudState(ownerId: string) {
  return resetLocalCloudState(requireBukiDatabase(), ownerId).then(() => {
    notifySyncQueueChanged();
  });
}

export function enqueueBukiAnalyticsEvent(
  event: Parameters<typeof enqueueAnalyticsEvent>[1],
) {
  return enqueueAnalyticsEvent(requireBukiDatabase(), event);
}

export function loadReadyBukiAnalyticsEvents(ownerId: string, now?: number, limit?: number) {
  return loadReadyAnalyticsEvents(requireBukiDatabase(), ownerId, now, limit);
}

export function completeBukiAnalyticsEvents(ownerId: string, ids: readonly string[]) {
  return completeAnalyticsEvents(requireBukiDatabase(), ownerId, ids);
}

export function failBukiAnalyticsEvent(
  event: Parameters<typeof failAnalyticsEvent>[1],
  error: unknown,
  now?: number,
) {
  return failAnalyticsEvent(requireBukiDatabase(), event, error, now);
}

export type { ImportedArchiveLibrary };
export type { LocalMediaFile, LocalMediaKind } from "./media-repository";
export type { QueuedAnalyticsEvent } from "./analytics-repository";
