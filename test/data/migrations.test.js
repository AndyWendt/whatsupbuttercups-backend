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
});
