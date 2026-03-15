import { describe, expect, it } from "vitest";
import { expandRecurrence } from "../../src/domain/recurrence.js";

describe("recurrence expansion", () => {
  it("expands daily recurrence across date range", () => {
    const dates = expandRecurrence(
      "daily",
      "2026-03-01",
      "2026-03-05",
    );

    expect(dates).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
  });

  it("expands weekly recurrence on the source weekday", () => {
    const dates = expandRecurrence(
      "weekly",
      "2026-03-02", // Monday
      "2026-03-16",
    );

    expect(dates).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
    ]);
  });

  it("expands custom weekdays", () => {
    const dates = expandRecurrence(
      { type: "custom_weekday", weekdays: [1, 3, 5] },
      "2026-03-01", // Sunday
      "2026-03-07",
    );

    expect(dates).toEqual([
      "2026-03-02",
      "2026-03-04",
      "2026-03-06",
    ]);
  });
});
