const toIsoDate = (date) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
  )
    .toISOString()
    .slice(0, 10);

const parseDate = (value) => {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const [year, month, day] = String(value).split("T")[0].split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const parseRule = (recurrence) => {
  if (typeof recurrence === "string") {
    if (recurrence === "daily" || recurrence === "weekly") {
      return { type: recurrence };
    }

    try {
      const parsed = JSON.parse(recurrence);
      return parseRule(parsed);
    } catch {
      return { type: "daily" };
    }
  }

  if (recurrence && Array.isArray(recurrence.weekdays)) {
    return {
      type: "custom_weekday",
      weekdays: recurrence.weekdays,
    };
  }

  return recurrence || { type: "daily" };
};

const normalizeWeekdays = (weekdays = []) =>
  new Set(
    weekdays
      .map((day) => Number(day))
      .filter((day) => Number.isFinite(day) && day >= 0 && day <= 6),
  );

const addDays = (date, increment) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + increment,
    ),
  );

export const expandRecurrence = (recurrence, startDate, endDate) => {
  const rule = parseRule(recurrence);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const dates = [];

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return dates;
  }

  if (start > end) {
    return dates;
  }

  let cursor = start;

  if (rule.type === "daily") {
    while (cursor <= end) {
      dates.push(toIsoDate(cursor));
      cursor = addDays(cursor, 1);
    }

    return dates;
  }

  if (rule.type === "weekly") {
    const targetWeekday = start.getUTCDay();
    while (cursor <= end) {
      if (cursor.getUTCDay() === targetWeekday) {
        dates.push(toIsoDate(cursor));
      }
      cursor = addDays(cursor, 1);
    }
    return dates;
  }

  if (rule.type === "custom_weekday") {
    const allowed = normalizeWeekdays(rule.weekdays);
    while (cursor <= end) {
      if (allowed.has(cursor.getUTCDay())) {
        dates.push(toIsoDate(cursor));
      }
      cursor = addDays(cursor, 1);
    }
    return dates;
  }

  return dates;
};
