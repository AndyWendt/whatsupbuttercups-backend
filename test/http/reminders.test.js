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
      owner_user_id: "user-uid-owner",
      recurrence: "daily",
      is_active: 1,
      created_at: "2026-03-01T00:00:00.000Z",
    },
  ];

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
  };
};

describe("GET /reminders/due", () => {
  it("returns due reminders for active items", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request(
        "https://example.test/reminders/due?as_of=2026-03-10T14:00:00.000Z",
        {
          headers: {
            Authorization: "Bearer owner-token",
          },
        },
      ),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0].item_id).toBe("item-1");
  });

  it("respects quiet hours in reminder selection", async () => {
    const env = {
      ...makeEnv(),
      reminderQuietHours: { start: 22, end: 6 },
    };

    const response = await worker.fetch(
      new Request(
        "https://example.test/reminders/due?as_of=2026-03-10T23:00:00.000Z",
        {
          headers: {
            Authorization: "Bearer owner-token",
          },
        },
      ),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reminders).toHaveLength(0);
  });
});

