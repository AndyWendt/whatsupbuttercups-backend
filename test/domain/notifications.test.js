import { describe, expect, it } from "vitest";
import { buildReminderPayload } from "../../src/domain/notifications.js";

describe("buildReminderPayload", () => {
  it("builds a deterministic reminder payload", () => {
    const payload = buildReminderPayload({
      item: { id: "item-1", title: "Read" },
      userId: "user-uid-owner",
      dueOn: "2026-03-10",
    });

    expect(payload).toMatchObject({
      notification: {
        title: "Task reminder",
        body: "Reminder for Read",
      },
      data: {
        item_id: "item-1",
        user_id: "user-uid-owner",
        due_on: "2026-03-10",
      },
    });
  });
});

