import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index.js";

const makeEnv = () => {
  const users = new Map([
    [
      "uid-owner",
      {
        id: "user-uid-owner",
        firebase_uid: "uid-owner",
        email: "owner@example.com",
        display_name: "Owner User",
      },
    ],
  ]);
  const items = [
    {
      id: "item-1",
      title: "Read",
      owner_user_id: "user-uid-owner",
      recurrence: "daily",
      is_active: 1,
      created_at: "2026-03-01T00:00:00.000Z",
    },
  ];
  const notifications = [];
  const pushed = [];

  return {
    users,
    verifyFirebaseToken: async (token) => {
      if (token === "owner-token") {
        return { uid: "uid-owner", email: "owner@example.com" };
      }
      throw new Error("invalid token");
    },
    getProfileByFirebaseUid: async (firebaseUid) => users.get(firebaseUid) || null,
    listItemsForUser: async () => items,
    listCompletionsForUserInRange: async (_userId, start, end) =>
      start === end && start === "2026-03-10" ? [] : [],
    getVacationWindowsForUser: async () => [],
    getLastReminderSentAtForItem: async () => null,
    listDeviceRegistrationsForUser: async () => [{ device_token: "token-1" }],
    createNotificationEvent: async ({
      userId,
      itemId,
      eventType,
      payload,
      now,
      dedupeKey,
    }) => {
      const event = {
        id: `${userId}:${itemId}:${now}`,
        item_id: itemId,
        user_id: userId,
        event_type: eventType,
        payload,
        created_at: now,
        dedupe_key: dedupeKey,
      };
      notifications.push(event);
      return event;
    },
    getNotificationEventByDedupKey: async (dedupeKey) =>
      notifications.find((notification) => notification.dedupe_key === dedupeKey) || null,
    sendPushNotification: async (token, payload) => {
      pushed.push({ token, payload });
    },
    _state: { notifications, pushed },
  };
};

describe("POST /reminders/dispatch", () => {
  it("writes reminder events and builds payload", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request(
        "https://example.test/reminders/dispatch?as_of=2026-03-10T14:00:00.000Z",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer owner-token",
          },
        },
      ),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dispatched).toBe(1);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].payload.data.item_id).toBe("item-1");
  });

  it("deduplicates repeated dispatch attempts", async () => {
    const env = makeEnv();
    const request = new Request(
      "https://example.test/reminders/dispatch?as_of=2026-03-10T14:00:00.000Z",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
        },
      },
    );
    await worker.fetch(request, env);
    const secondResponse = await worker.fetch(request, env);
    const secondBody = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondBody.dispatched).toBe(0);
  });
});
