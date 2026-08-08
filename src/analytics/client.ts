import * as Application from "expo-application";
import * as Crypto from "expo-crypto";

import {
  completeBukiAnalyticsEvents,
  enqueueBukiAnalyticsEvent,
  failBukiAnalyticsEvent,
  loadReadyBukiAnalyticsEvents,
  type QueuedAnalyticsEvent,
} from "@/database";
import { getSupabaseClient } from "@/auth/supabase";
import {
  buildAnalyticsEvent,
  remoteAnalyticsEvent,
  type AnalyticsEventInput,
  type AnalyticsEventRecord,
} from "./events";

let activeOwnerId: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushRun: Promise<void> | null = null;

function clearFlushTimer(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

function scheduleFlush(delay: number = 0): void {
  clearFlushTimer();
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAnalyticsEvents();
  }, delay);
}

function queuedRecord(event: QueuedAnalyticsEvent): AnalyticsEventRecord {
  return {
    id: event.id,
    ownerId: event.ownerId,
    eventName: event.eventName as AnalyticsEventRecord["eventName"],
    source: event.source,
    feature: event.feature as AnalyticsEventRecord["feature"],
    plan: event.plan as AnalyticsEventRecord["plan"],
    result: event.result as AnalyticsEventRecord["result"],
    exportKind: event.exportKind as AnalyticsEventRecord["exportKind"],
    appVersion: event.appVersion,
    buildNumber: event.buildNumber,
    occurredAt: event.occurredAt,
  };
}

export function initializeAnalytics(ownerId: string): void {
  activeOwnerId = ownerId;
  scheduleFlush();
}

export function disconnectAnalytics(): void {
  activeOwnerId = null;
  clearFlushTimer();
}

export async function trackAnalyticsEvent(
  ownerId: string | null | undefined,
  input: AnalyticsEventInput,
): Promise<void> {
  if (!ownerId) return;
  try {
    const event = buildAnalyticsEvent(ownerId, input, {
      id: Crypto.randomUUID(),
      now: Date.now(),
      appVersion: Application.nativeApplicationVersion,
      buildNumber: Application.nativeBuildVersion,
    });
    await enqueueBukiAnalyticsEvent(event);
    if (activeOwnerId === ownerId) scheduleFlush();
  } catch {
    // Analytics is intentionally best-effort and never changes product behavior.
  }
}

export async function flushAnalyticsEvents(): Promise<void> {
  if (flushRun) {
    await flushRun;
    if (activeOwnerId) scheduleFlush();
    return;
  }
  flushRun = (async () => {
    const ownerId = activeOwnerId;
    if (!ownerId) return;
    for (let batch = 0; batch < 4 && activeOwnerId === ownerId; batch += 1) {
      const events = await loadReadyBukiAnalyticsEvents(ownerId, Date.now(), 25);
      if (events.length === 0) return;
      const payload = events.map((event) => remoteAnalyticsEvent(queuedRecord(event)));
      const { error } = await getSupabaseClient().rpc("record_analytics_events", {
        events: payload,
      });
      if (activeOwnerId !== ownerId) return;
      if (error) {
        const retryTimes = await Promise.all(
          events.map((event) => failBukiAnalyticsEvent(event, error)),
        );
        scheduleFlush(Math.max(1_000, Math.min(...retryTimes) - Date.now()));
        return;
      }
      await completeBukiAnalyticsEvents(ownerId, events.map((event) => event.id));
    }
    if (activeOwnerId === ownerId) scheduleFlush(1_000);
  })()
    .catch(() => {
      if (activeOwnerId) scheduleFlush(60_000);
    })
    .finally(() => {
      flushRun = null;
    });
  return flushRun;
}
