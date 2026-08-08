import type { SQLiteDatabase } from "expo-sqlite";

import {
  tierForEntitlement,
  type EntitlementSnapshot,
  type EntitlementStatus,
  type ProProduct,
} from "@/subscription/access";

function product(value: string | null): ProProduct {
  return value === "monthly" || value === "yearly" || value === "lifetime" ? value : null;
}

function status(value: string): EntitlementStatus {
  return value === "active" || value === "grace" || value === "expired" ? value : "unknown";
}

export async function saveLocalEntitlementSnapshot(
  db: SQLiteDatabase,
  ownerId: string,
  snapshot: EntitlementSnapshot,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO entitlement_snapshots (
        owner_id, tier, product, status, expires_at, will_renew, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ownerId,
      tierForEntitlement(snapshot.status),
      snapshot.product,
      snapshot.status,
      snapshot.expiresAt,
      snapshot.willRenew ? 1 : 0,
      snapshot.checkedAt ?? new Date().toISOString(),
    );
    await tx.runAsync(
      `DELETE FROM entitlement_snapshots
       WHERE owner_id = ? AND id NOT IN (
         SELECT id FROM entitlement_snapshots WHERE owner_id = ? ORDER BY id DESC LIMIT 20
       )`,
      ownerId,
      ownerId,
    );
  });
}

export async function loadLocalEntitlementSnapshot(
  db: SQLiteDatabase,
  ownerId: string,
): Promise<EntitlementSnapshot | null> {
  const row = await db.getFirstAsync<{
    product: string | null;
    status: string;
    expires_at: string | null;
    will_renew: number;
    checked_at: string;
  }>(
    `SELECT product, status, expires_at, will_renew, checked_at
     FROM entitlement_snapshots WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
    ownerId,
  );
  return row
    ? {
        product: product(row.product),
        status: status(row.status),
        expiresAt: row.expires_at,
        willRenew: row.will_renew === 1,
        checkedAt: row.checked_at,
      }
    : null;
}
