import { describe, expect, it } from "vitest";
import { isInQuietHours, selectDueReminders } from "../../src/domain/reminders.js";

describe("isInQuietHours", () => {
  it("supports overnight quiet windows", () => {
    expect(isInQuietHours(new Date("2026-03-10T23:00:00.000Z"), { start: 22, end: 6 })).toBe(true);
    expect(isInQuietHours(new Date("2026-03-10T05:00:00.000Z"), { start: 22, end: 6 })).toBe(true);
    expect(isInQuietHours(new Date("2026-03-10T12:00:00.000Z"), { start: 22, end: 6 })).toBe(false);
  });
});

describe("selectDueReminders", () => {
  const items = [
    {
      id: "item-1",
      owner_user_id: "user-uid-owner",
      recurrence: "daily",
      is_active: 1,
      created_at: "2026-03-01T00:00:00.000Z",
    },
  ];

  it("includes an item when it is due, uncompleted, and not in quiet hours", () => {
    const due = selectDueReminders({
      asOf: "2026-03-10T14:00:00.000Z",
      items,
      completions: [],
      userVacations: [],
      options: { quietHours: { start: 22, end: 6 }, reminderCadenceHours: 12 },
    });

    expect(due).toHaveLength(1);
    expect(due[0].item_id).toBe("item-1");
  });

  it("is suppressed when already completed", () => {
    const due = selectDueReminders({
      asOf: "2026-03-10T14:00:00.000Z",
      items,
      completions: [{ item_id: "item-1", occurred_on: "2026-03-10" }],
      userVacations: [],
      options: { reminderCadenceHours: 12 },
    });

    expect(due).toHaveLength(0);
  });

  it("respects quiet hours", () => {
    const due = selectDueReminders({
      asOf: "2026-03-10T23:00:00.000Z",
      items,
      completions: [],
      userVacations: [],
      options: { quietHours: { start: 22, end: 6 }, reminderCadenceHours: 12 },
    });

    expect(due).toHaveLength(0);
  });

  it("respects nagging cadence", () => {
    const due = selectDueReminders({
      asOf: "2026-03-10T14:00:00.000Z",
      items,
      completions: [],
      lastReminderByItem: { "item-1": "2026-03-10T10:00:00.000Z" },
      userVacations: [],
      options: { reminderCadenceHours: 12 },
    });

    expect(due).toHaveLength(0);
  });

  it("suppresses reminders during vacation", () => {
    const due = selectDueReminders({
      asOf: "2026-03-10T14:00:00.000Z",
      items,
      completions: [],
      userVacations: [{ starts_at: "2026-03-09", ends_at: "2026-03-10" }],
      options: { reminderCadenceHours: 12 },
    });

    expect(due).toHaveLength(0);
  });
});

