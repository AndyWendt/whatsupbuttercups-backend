import { expandRecurrence } from "./recurrence.js";

export const isInQuietHours = (date, quietWindow) => {
  const start = quietWindow?.start ?? 22;
  const end = quietWindow?.end ?? 7;
  const hour = date.getUTCHours();

  if (start < 0 || start > 23 || end < 0 || end > 23) {
    return false;
  }

  if (start <= end) {
    return hour >= start && hour <= end;
  }

  return hour >= start || hour <= end;
};

const overlapsWindow = (candidate, windowStart, windowEnd) => {
  const target = new Date(`${candidate}T00:00:00.000Z`);
  const start = new Date(`${windowStart}T00:00:00.000Z`);
  const end = new Date(`${windowEnd}T00:00:00.000Z`);
  return target.getTime() >= start.getTime() && target.getTime() <= end.getTime();
};

export const selectDueReminders = ({
  asOf,
  items,
  completions,
  lastReminderByItem = {},
  userVacations = [],
  options = {},
}) => {
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  const dateOnly = `${now.toISOString().slice(0, 10)}`;
  const cadenceHours = options.reminderCadenceHours ?? 24;
  const quietWindow = options.quietHours || { start: 22, end: 6 };
  const completionLookup = new Set(
    completions.map((completion) => `${completion.item_id}:${completion.occurred_on}`),
  );
  const reminderCutoff = now.getTime() - (cadenceHours * 60 * 60 * 1000);

  const due = [];

  for (const item of items) {
    if (Number(item.is_active) === 0) {
      continue;
    }

    const occurrences = expandRecurrence(
      item.recurrence,
      item.created_at?.slice(0, 10) || dateOnly,
      dateOnly,
    );
    if (!occurrences.includes(dateOnly)) {
      continue;
    }

    if (completionLookup.has(`${item.id}:${dateOnly}`)) {
      continue;
    }

    const suppressedByVacation = userVacations.some(
      (window) => overlapsWindow(dateOnly, window.starts_at, window.ends_at),
    );
    if (suppressedByVacation) {
      continue;
    }

    const lastReminderAt = lastReminderByItem[item.id];
    if (lastReminderAt && new Date(lastReminderAt).getTime() > reminderCutoff) {
      continue;
    }

    if (isInQuietHours(now, quietWindow)) {
      continue;
    }

    due.push({
      item_id: item.id,
      user_id: item.owner_user_id,
      due_on: dateOnly,
    });
  }

  return due;
};
