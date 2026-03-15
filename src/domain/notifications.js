export const buildReminderPayload = ({ item, userId, dueOn }) => {
  const safeDueOn = dueOn || new Date().toISOString().slice(0, 10);
  return {
    notification: {
      title: "Task reminder",
      body: `Reminder for ${item.title}`,
    },
    data: {
      item_id: item.id,
      user_id: userId,
      due_on: safeDueOn,
    },
  };
};

export const buildNotificationEvent = ({ userId, itemId, payload, now }) => ({
  id: crypto.randomUUID(),
  user_id: userId,
  item_id: itemId,
  event_type: "reminder",
  payload: JSON.stringify(payload),
  created_at: now,
});

