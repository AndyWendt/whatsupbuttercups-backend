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
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    [
      "uid-member",
      {
        id: "user-uid-member",
        firebase_uid: "uid-member",
        email: "member@example.com",
        display_name: "Member User",
        created_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      "uid-joiner",
      {
        id: "user-uid-joiner",
        firebase_uid: "uid-joiner",
        email: "joiner@example.com",
        display_name: "Joiner User",
        created_at: "2026-01-03T00:00:00.000Z",
      },
    ],
  ]);

  const households = new Map([
    [
      "household-1",
      {
        id: "household-1",
        name: "Family",
        creator_user_id: "user-uid-owner",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  ]);
  const householdMembers = new Map([
    [
      "household-1:user-uid-owner",
      {
        household_id: "household-1",
        user_id: "user-uid-owner",
        role: "admin",
      },
    ],
    [
      "household-1:user-uid-member",
      {
        household_id: "household-1",
        user_id: "user-uid-member",
        role: "member",
      },
    ],
  ]);
  const invites = new Map();

  return {
    users,
    households,
    householdMembers,
    invites,
    verifyFirebaseToken: async (token) => {
      if (token === "owner-token") {
        return { uid: "uid-owner", email: "owner@example.com", name: "Owner User" };
      }
      if (token === "member-token") {
        return { uid: "uid-member", email: "member@example.com", name: "Member User" };
      }
      if (token === "joiner-token") {
        return { uid: "uid-joiner", email: "joiner@example.com", name: "Joiner User" };
      }
      throw new Error("invalid token");
    },
    getProfileByFirebaseUid: async (firebaseUid) => users.get(firebaseUid) || null,
    getHouseholdMembership: async (householdId, userId) =>
      householdMembers.get(`${householdId}:${userId}`) || null,
    putInviteToken: async (invite) => {
      invites.set(invite.token, invite);
      return invite;
    },
    getInviteToken: async (token) => invites.get(token) || null,
    markInviteAccepted: async (token, payload) => {
      const invite = invites.get(token);
      if (!invite) {
        return null;
      }
      const updated = {
        ...invite,
        ...payload,
        status: "accepted",
      };
      invites.set(token, updated);
      return updated;
    },
    addHouseholdMember: async ({ householdId, userId, role }) => {
      const member = {
        household_id: householdId,
        user_id: userId,
        role,
      };
      householdMembers.set(`${householdId}:${userId}`, member);
      return member;
    },
  };
};

describe("POST /household/invites", () => {
  it("allows admin to create an invite and stores token in invites", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/household/invites", {
      method: "POST",
      headers: {
        Authorization: "Bearer owner-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        household_id: "household-1",
        invitee_email: "joiner@example.com",
      }),
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.invite).toMatchObject({
      household_id: "household-1",
      inviter_user_id: "user-uid-owner",
      invitee_email: "joiner@example.com",
      status: "pending",
    });
    expect(env.invites.get(body.invite.token)).toBeDefined();
  });

  it("rejects non-admin invite creation", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/household/invites", {
      method: "POST",
      headers: {
        Authorization: "Bearer member-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        household_id: "household-1",
        invitee_email: "joiner@example.com",
      }),
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("forbidden");
  });
});

describe("POST /household/join", () => {
  it("accepts pending invite and adds member as member", async () => {
    const env = makeEnv();
    const token = "invite-1";
    env.invites.set(token, {
      token,
      household_id: "household-1",
      inviter_user_id: "user-uid-owner",
      invitee_email: "joiner@example.com",
      status: "pending",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const request = new Request("https://example.test/household/join", {
      method: "POST",
      headers: {
        Authorization: "Bearer joiner-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      household_id: "household-1",
      member: {
        role: "member",
        user_id: "user-uid-joiner",
      },
    });
    expect(env.invites.get(token).status).toBe("accepted");
    expect(env.householdMembers.get("household-1:user-uid-joiner")).toMatchObject({
      role: "member",
    });
  });
});
