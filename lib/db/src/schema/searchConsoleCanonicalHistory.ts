import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const searchConsoleCanonicalHistoryTable = pgTable(
  "search_console_canonical_history",
  {
    id: serial("id").primaryKey(),
    pageUrl: text("page_url").notNull(),
    userCanonical: text("user_canonical"),
    googleCanonical: text("google_canonical"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pageObservedIndex: index("search_console_canonical_history_page_observed_idx")
      .on(table.pageUrl, table.observedAt, table.id),
  }),
);

export const insertSearchConsoleCanonicalHistorySchema = createInsertSchema(
  searchConsoleCanonicalHistoryTable,
).omit({ id: true, observedAt: true });

export type InsertSearchConsoleCanonicalHistory = z.infer<
  typeof insertSearchConsoleCanonicalHistorySchema
>;
export type SearchConsoleCanonicalHistory = typeof searchConsoleCanonicalHistoryTable.$inferSelect;
