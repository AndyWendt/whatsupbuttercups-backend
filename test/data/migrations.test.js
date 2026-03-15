import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../../src/data/migrations.js";

const expectedTables = [
  "users",
  "households",
  "household_members",
  "items",
  "occurrence_completions",
  "vacation_windows",
  "device_registrations",
  "household_invites",
  "notification_events",
];

describe("baseline d1 schema", () => {
  it("creates required tables from initial migration", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db);

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    const tableNames = rows.map((row) => row.name);

    for (const tableName of expectedTables) {
      expect(tableNames).toContain(tableName);
    }
  });

  it("adds storage contract columns in follow-up migration", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db);

    const completionColumns = db
      .prepare("PRAGMA table_info(occurrence_completions)")
      .all()
      .map((row) => row.name);
    const notificationColumns = db
      .prepare("PRAGMA table_info(notification_events)")
      .all()
      .map((row) => row.name);
    const completionIndexes = db
      .prepare("PRAGMA index_list(occurrence_completions)")
      .all()
      .map((row) => row.name);
    const notificationIndexes = db
      .prepare("PRAGMA index_list(notification_events)")
      .all()
      .map((row) => row.name);

    expect(completionColumns).toContain("user_id");
    expect(notificationColumns).toContain("dedupe_key");
    expect(completionIndexes).toContain("idx_occurrence_completions_item_date");
    expect(completionIndexes).toContain("idx_occurrence_completions_item_date_unique");
    expect(notificationIndexes).toContain("idx_notification_events_dedupe_key");
    expect(notificationIndexes).toContain("idx_notification_events_item_user");
  });
});
