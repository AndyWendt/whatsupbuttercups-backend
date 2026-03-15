import { describe, expect, it } from "vitest";
import { projectWeekProgress } from "../../src/domain/weekProgress.js";

describe("projectWeekProgress", () => {
  const items = [
    {
      id: "item-daily",
      recurrence: "daily",
      is_active: 1,
      created_at: "2026-03-01T00:00:00.000Z",
      owner_user_id: "user-uid-owner",
      household_id: null,
    },
    {
      id: "item-weekly",
      recurrence: "weekly",
      is_active: 1,
      created_at: "2026-03-01T00:00:00.000Z",
      owner_user_id: "user-uid-owner",
      household_id: null,
    },
  ];

  it("recomputes progress from provided completion history", () => {
    const baseCompletions = [
      { item_id: "item-daily", occurred_on: "2026-03-03" },
      { item_id: "item-daily", occurred_on: "2026-03-04" },
      { item_id: "item-daily", occurred_on: "2026-03-05" },
      { item_id: "item-weekly", occurred_on: "2026-03-08" },
    ];

    const first = projectWeekProgress({
      weekStart: "2026-03-02",
      weekEnd: "2026-03-08",
      items,
      completions: baseCompletions,
    });
    const second = projectWeekProgress({
      weekStart: "2026-03-02",
      weekEnd: "2026-03-08",
      items,
      completions: [
        ...baseCompletions.filter((row) => row.occurred_on !== "2026-03-03"),
      ],
    });

    expect(first.completed_count).toBe(4);
    expect(second.completed_count).toBe(3);
    expect(first.expected_count).toBe(8);
    expect(second.expected_count).toBe(8);
  });
});

