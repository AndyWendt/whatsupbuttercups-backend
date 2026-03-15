import { describe, expect, it } from "vitest";
import { calculateCurrentStreak } from "../../src/domain/streak.js";

describe("calculateCurrentStreak", () => {
  it("counts consecutive completions from end of schedule", () => {
    const expected = ["2026-03-01", "2026-03-02", "2026-03-03"];
    const completed = ["2026-03-01", "2026-03-02", "2026-03-03"];

    const streak = calculateCurrentStreak(expected, completed, "2026-03-03");

    expect(streak).toBe(3);
  });

  it("breaks when a target date was missed", () => {
    const expected = ["2026-03-01", "2026-03-02", "2026-03-03"];
    const completed = ["2026-03-01", "2026-03-03"];

    const streak = calculateCurrentStreak(expected, completed, "2026-03-03");

    expect(streak).toBe(1);
  });

  it("is idempotent with duplicate completion entries", () => {
    const expected = ["2026-03-01", "2026-03-02", "2026-03-03"];
    const completed = [
      "2026-03-01",
      "2026-03-01",
      "2026-03-02",
    ];

    const streak = calculateCurrentStreak(expected, completed, "2026-03-03");

    expect(streak).toBe(0);
  });

  it("can compute irregular schedules", () => {
    const expected = ["2026-03-03", "2026-03-10"];
    const completed = ["2026-03-03", "2026-03-10"];

    const streak = calculateCurrentStreak(expected, completed, "2026-03-10");

    expect(streak).toBe(2);
  });
});

