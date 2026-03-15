const normalizeDate = (value) => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

const uniqueSorted = (values) => [...new Set(values.map(normalizeDate))].sort();

export const calculateCurrentStreak = (
  expectedDates = [],
  completionDates = [],
  asOf = new Date().toISOString(),
) => {
  const expected = uniqueSorted(expectedDates)
    .filter((date) => date <= normalizeDate(asOf));

  if (expected.length === 0) {
    return 0;
  }

  const completed = new Set(completionDates.map(normalizeDate));
  let streak = 0;

  for (let i = expected.length - 1; i >= 0; i -= 1) {
    const date = expected[i];
    if (!completed.has(date)) {
      break;
    }
    streak += 1;
  }

  return streak;
};

