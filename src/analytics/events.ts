import type { ProFeature, ProProduct } from "@/subscription/access";

export const ANALYTICS_EVENT_NAMES = [
  "paywall_viewed",
  "purchase_started",
  "purchase_completed",
  "purchase_cancelled",
  "purchase_failed",
  "trial_started",
  "restore_attempted",
  "restore_completed",
  "backup_enabled",
  "quota_exceeded",
  "export_used",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsPlan = Exclude<ProProduct, null>;
export type AnalyticsResult = "success" | "not_found" | "failed" | "cancelled";
export type AnalyticsExportKind =
  | "png"
  | "jpg"
  | "share_card"
  | "pdf"
  | "zip"
  | "buki_archive";

export interface AnalyticsEventInput {
  name: AnalyticsEventName;
  source?: string;
  feature?: ProFeature;
  plan?: AnalyticsPlan;
  result?: AnalyticsResult;
  exportKind?: AnalyticsExportKind;
}

export interface AnalyticsEventRecord {
  id: string;
  ownerId: string;
  eventName: AnalyticsEventName;
  source: string | null;
  feature: ProFeature | null;
  plan: AnalyticsPlan | null;
  result: AnalyticsResult | null;
  exportKind: AnalyticsExportKind | null;
  appVersion: string | null;
  buildNumber: string | null;
  occurredAt: number;
}

const EVENT_NAMES = new Set<string>(ANALYTICS_EVENT_NAMES);
const FEATURES = new Set<string>([
  "children",
  "sketchpads",
  "artworks",
  "cloudBackup",
  "exportData",
  "advancedOrganization",
  "premiumVisuals",
]);
const PLANS = new Set<string>(["monthly", "yearly", "lifetime"]);
const RESULTS = new Set<string>(["success", "not_found", "failed", "cancelled"]);
const EXPORT_KINDS = new Set<string>([
  "png",
  "jpg",
  "share_card",
  "pdf",
  "zip",
  "buki_archive",
]);

function nullableCode(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || null;
}

function allowed<T extends string>(value: T | undefined, values: Set<string>): T | null {
  return value && values.has(value) ? value : null;
}

export function buildAnalyticsEvent(
  ownerId: string,
  input: AnalyticsEventInput,
  context: {
    id: string;
    now: number;
    appVersion?: string | null;
    buildNumber?: string | null;
  },
): AnalyticsEventRecord {
  if (!EVENT_NAMES.has(input.name)) throw new Error("Unsupported Buki analytics event");
  return {
    id: context.id,
    ownerId,
    eventName: input.name,
    source: nullableCode(input.source),
    feature: allowed(input.feature, FEATURES),
    plan: allowed(input.plan, PLANS),
    result: allowed(input.result, RESULTS),
    exportKind: allowed(input.exportKind, EXPORT_KINDS),
    appVersion: context.appVersion?.slice(0, 40) || null,
    buildNumber: context.buildNumber?.slice(0, 40) || null,
    occurredAt: context.now,
  };
}

export function remoteAnalyticsEvent(event: AnalyticsEventRecord) {
  return {
    id: event.id,
    event_name: event.eventName,
    source: event.source,
    feature: event.feature,
    plan: event.plan,
    result: event.result,
    export_kind: event.exportKind,
    app_version: event.appVersion,
    build_number: event.buildNumber,
    occurred_at: new Date(event.occurredAt).toISOString(),
  };
}
