import { expandRecurrence } from "./recurrence.js";

const toPercent = (completed, expected) => {
  if (expected === 0) {
    return 0;
  }

  return Math.round((completed / expected) * 10000) / 100;
};

export const projectWeekProgress = ({
  weekStart,
  weekEnd,
  items,
  completions,
}) => {
  const completionLookup = new Set(
    completions.map((completion) => `${completion.item_id}:${completion.occurred_on}`),
  );

  let expectedCount = 0;
  let completedCount = 0;

  for (const item of items) {
    if (Number(item.is_active) === 0) {
      continue;
    }

    const occurrences = expandRecurrence(
      item.recurrence,
      item.created_at?.slice(0, 10) || weekStart,
      weekEnd,
    ).filter((date) => date >= weekStart && date <= weekEnd);

    for (const date of occurrences) {
      expectedCount += 1;
      if (completionLookup.has(`${item.id}:${date}`)) {
        completedCount += 1;
      }
    }
  }

  return {
    expected_count: expectedCount,
    completed_count: completedCount,
    progress_percent: toPercent(completedCount, expectedCount),
  };
};

