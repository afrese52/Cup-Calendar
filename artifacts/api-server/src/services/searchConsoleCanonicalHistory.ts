import { desc, eq, sql } from "drizzle-orm";
import { db, searchConsoleCanonicalHistoryTable } from "@workspace/db";
import {
  shouldRecordCanonicalSnapshot,
  type SearchConsoleCanonicalHistoryInput,
  type SearchConsoleCanonicalHistorySummary,
} from "./searchConsole";

function toDateTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function toIsoTimestamp(value: unknown): string | null {
  if (value == null) return null;
  const timestamp = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("Canonical history returned an invalid timestamp.");
  }
  return timestamp.toISOString();
}

export async function recordSearchConsoleCanonicalHistory(
  snapshot: SearchConsoleCanonicalHistoryInput,
): Promise<SearchConsoleCanonicalHistorySummary> {
  return await db.transaction(async (transaction) => {
    await transaction.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(${snapshot.url}, 0))
    `);

    const [latest] = await transaction
      .select({
        userCanonical: searchConsoleCanonicalHistoryTable.userCanonical,
        googleCanonical: searchConsoleCanonicalHistoryTable.googleCanonical,
      })
      .from(searchConsoleCanonicalHistoryTable)
      .where(eq(searchConsoleCanonicalHistoryTable.pageUrl, snapshot.url))
      .orderBy(
        desc(searchConsoleCanonicalHistoryTable.observedAt),
        desc(searchConsoleCanonicalHistoryTable.id),
      )
      .limit(1);

    if (shouldRecordCanonicalSnapshot(latest ?? null, snapshot)) {
      await transaction.insert(searchConsoleCanonicalHistoryTable).values({
        pageUrl: snapshot.url,
        userCanonical: snapshot.userCanonical,
        googleCanonical: snapshot.googleCanonical,
      });
    }

    const [summary] = await transaction
      .select({
        firstDetectedAt: sql<Date | null>`
          min(${searchConsoleCanonicalHistoryTable.observedAt})
          filter (
            where ${searchConsoleCanonicalHistoryTable.userCanonical} is not null
              and ${searchConsoleCanonicalHistoryTable.googleCanonical} is not null
              and ${searchConsoleCanonicalHistoryTable.userCanonical}
                is distinct from ${searchConsoleCanonicalHistoryTable.googleCanonical}
          )
        `.mapWith(toDateTimestamp),
        lastChangedAt: sql<Date | null>`max(${searchConsoleCanonicalHistoryTable.observedAt})`
          .mapWith(toDateTimestamp),
      })
      .from(searchConsoleCanonicalHistoryTable)
      .where(eq(searchConsoleCanonicalHistoryTable.pageUrl, snapshot.url));

    return {
      firstDetectedAt: toIsoTimestamp(summary?.firstDetectedAt),
      lastChangedAt: toIsoTimestamp(summary?.lastChangedAt),
    };
  });
}
