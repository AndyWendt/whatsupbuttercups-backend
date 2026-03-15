import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../../src/data/migrations.js";
import { createRepository, bindRepositoryToEnv } from "../../src/data/repositories.js";

const makeDb = () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db);
  return db;
};

describe("sqlite repository", () => {
  it("creates and fetches user/profile rows", async () => {
    const db = makeDb();
    const repo = createRepository(db);
    const user = await repo.createUser({
      id: "user-1",
      firebaseUid: "uid-1",
      email: "owner@example.com",
      displayName: "Owner User",
      createdAt: "2026-03-01T00:00:00.000Z",
    });

    const found = await repo.getUserByFirebaseUid("uid-1");

    expect(found).toMatchObject({
      id: user.id,
      firebase_uid: "uid-1",
      email: "owner@example.com",
      display_name: "Owner User",
    });
  });

  it("enforces household visibility in listItemsForUser", async () => {
    const db = makeDb();
    const repo = createRepository(db);
    const userA = await repo.createUser({
      id: "user-a",
      firebaseUid: "uid-a",
      email: "a@example.com",
      displayName: "A",
    });
    const userB = await repo.createUser({
      id: "user-b",
      firebaseUid: "uid-b",
      email: "b@example.com",
      displayName: "B",
    });
    const household = await repo.createHousehold({
      id: "house-1",
      name: "Home",
      creatorUserId: userA.id,
    });
    await repo.addHouseholdMember({
      householdId: household.id,
      userId: userB.id,
      role: "member",
    });
    const personal = await repo.createItem({
      id: "item-a",
      owner_user_id: userA.id,
      title: "Read",
      recurrence: "daily",
      is_active: 1,
    });
    const householdItem = await repo.createItem({
      id: "item-b",
      household_id: household.id,
      owner_user_id: userB.id,
      title: "Pack",
      recurrence: "daily",
      is_active: 1,
    });

    await repo.addHouseholdMember({
      householdId: household.id,
      userId: userA.id,
      role: "admin",
    });

    const visible = await repo.listItemsForUser(userB.id);
    const visibleIds = visible.map((row) => row.id);

    expect(visibleIds).not.toContain(personal.id);
    expect(visibleIds).toContain(householdItem.id);
  });

  it("writes idempotent occurrence completions", async () => {
    const db = makeDb();
    const repo = createRepository(db);
    const user = await repo.createUser({
      id: "user-a",
      firebaseUid: "uid-a",
      email: "a@example.com",
    });
    const item = await repo.createItem({
      id: "item-a",
      owner_user_id: user.id,
      title: "Task",
      recurrence: "daily",
      is_active: 1,
    });

    const first = await repo.createOccurrenceCompletion({
      item_id: item.id,
      occurred_on: "2026-03-10",
      completed_at: "2026-03-10T10:00:00.000Z",
      user_id: user.id,
    });
    const second = await repo.createOccurrenceCompletion({
      item_id: item.id,
      occurred_on: "2026-03-10",
      completed_at: "2026-03-10T12:00:00.000Z",
      user_id: user.id,
    });

    const completions = await repo.listCompletionsForUserInRange(
      user.id,
      "2026-03-10",
      "2026-03-10",
    );

    expect(first.occurred_on).toBe("2026-03-10");
    expect(second.occurred_on).toBe("2026-03-10");
    expect(completions).toHaveLength(1);
  });

  it("supports reminder dedupe keys", async () => {
    const db = makeDb();
    const repo = createRepository(db);
    const user = await repo.createUser({
      id: "user-a",
      firebaseUid: "uid-a",
      email: "a@example.com",
    });
    const item = await repo.createItem({
      id: "item-a",
      owner_user_id: user.id,
      title: "Task",
      recurrence: "daily",
      is_active: 1,
    });
    const event = await repo.createNotificationEvent({
      userId: user.id,
      itemId: item.id,
      eventType: "reminder",
      payload: "{}",
      now: "2026-03-10T14:00:00.000Z",
      dedupeKey: "reminder:user-a:item-a:2026-03-10",
    });
    const existing = await repo.getNotificationEventByDedupKey(event.dedupe_key);
    const last = await repo.getLastReminderSentAtForItem(item.id);

    expect(existing).not.toBeNull();
    expect(last.created_at).toBe("2026-03-10T14:00:00.000Z");
  });

  it("binds repository methods when env has DB", async () => {
    const db = makeDb();
    const env = {
      DB: db,
      verifyFirebaseToken: async (token) => {
        if (token === "token-a") {
          return { uid: "uid-a", email: "a@example.com" };
        }
        throw new Error("invalid token");
      },
      getProfileByFirebaseUid: undefined,
      upsertProfile: undefined,
      getUserByFirebaseUid: undefined,
      createUser: undefined,
      createHousehold: undefined,
      addHouseholdMember: undefined,
    };
    const repo = createRepository(db);
    await repo.createUser({
      id: "user-a",
      firebaseUid: "uid-a",
      email: "a@example.com",
      displayName: "Owner",
    });

    const bound = bindRepositoryToEnv(env);
    expect(typeof bound.getProfileByFirebaseUid).toBe("function");
    expect(bound.getProfileByFirebaseUid).not.toBe(env.getProfileByFirebaseUid);
    const user = await bound.getProfileByFirebaseUid("uid-a");
    expect(user).not.toBeNull();
  });

  it.each(["DB", "db", "D1", "d1"])(
    "binds repository methods from env.%s",
    async (dbKey) => {
      const db = makeDb();
      const env = {
        verifyFirebaseToken: async (token) => {
          if (token === "token-a") {
            return { uid: "uid-a", email: "a@example.com" };
          }
          throw new Error("invalid token");
        },
        [dbKey]: db,
      };
      const repo = createRepository(db);
      await repo.createUser({
        id: "user-a",
        firebaseUid: "uid-a",
        email: "a@example.com",
      });

      const bound = bindRepositoryToEnv(env);
      expect(bound).toHaveProperty("createHousehold");
      expect(typeof bound.getProfileByFirebaseUid).toBe("function");

      const user = await bound.getUserByFirebaseUid("uid-a");
      expect(user).not.toBeNull();
    },
  );
});
