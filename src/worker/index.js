import { expandRecurrence } from "../domain/recurrence.js";

const buildHealthPayload = () => ({
  service: "whatsupbuttercups-backend",
  status: "ok",
  timestamp: new Date().toISOString(),
});

const buildAuthPayload = ({ id, firebaseUid, email, displayName, createdAt }) => ({
  user: {
    id,
    firebase_uid: firebaseUid,
    email,
    display_name: displayName,
    created_at: createdAt,
  },
});

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });

const notFound = () => new Response("Not Found", { status: 404 });
const badRequest = (message) =>
  json({ error: "bad_request", message }, { status: 400 });
const unauthorized = (message) =>
  json({ error: "unauthorized", message }, { status: 401 });
const forbidden = (message) =>
  json({ error: "forbidden", message }, { status: 403 });
const conflict = (message) =>
  json({ error: "conflict", message }, { status: 409 });

const extractBearerToken = (request) => {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

const parseJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const readProfileFromEnv = async (env, firebaseUid) => {
  if (typeof env.getProfileByFirebaseUid !== "function") {
    return null;
  }

  return env.getProfileByFirebaseUid(firebaseUid);
};

const writeProfileToEnv = async (env, firebaseUid, updates) => {
  if (typeof env.upsertProfile !== "function") {
    return null;
  }

  return env.upsertProfile(firebaseUid, updates);
};

const requireHouseholdMembership = async (env, user, householdId) => {
  if (typeof env.getHouseholdMembership !== "function") {
    return {
      response: json(
        { error: "unavailable", message: "membership lookup unavailable" },
        { status: 503 },
      ),
    };
  }

  const membership = await env.getHouseholdMembership(householdId, user.id);
  if (!membership) {
    return {
      response: forbidden("household membership required"),
      membership: null,
    };
  }

  return { response: null, membership };
};

const requireHouseholdRole = async (env, user, householdId, requiredRole) => {
  const membershipContext = await requireHouseholdMembership(
    env,
    user,
    householdId,
  );
  if (membershipContext.response) {
    return membershipContext;
  }

  if (membershipContext.membership.role !== requiredRole) {
    return {
      response: forbidden(
        `household ${requiredRole} role required`,
      ),
      membership: membershipContext.membership,
    };
  }

  return { response: null, membership: membershipContext.membership };
};

const profilePayload = ({ id, email, displayName, createdAt, firebaseUid }) => ({
  user: {
    id,
    firebase_uid: firebaseUid,
    email,
    display_name: displayName,
    created_at: createdAt,
  },
});

const householdPayload = ({ household, member }) => {
  const payload = {
    household,
  };

  if (member) {
    payload.member = member;
  }

  return payload;
};

const handleSessionVerify = async (request, env) => {
  const body = await parseJson(request);
  const token = body?.token;
  const verifyFirebaseToken = env?.verifyFirebaseToken;

  if (!token || typeof token !== "string") {
    return badRequest("token is required");
  }

  if (typeof verifyFirebaseToken !== "function") {
    return unauthorized("token verification is unavailable");
  }

  try {
    const claims = await verifyFirebaseToken(token);
    const firebaseUid = claims?.uid;
    const getUserByFirebaseUid = env.getUserByFirebaseUid || (async () => null);
    const createUser = env.createUser || (async (userData) => userData);

    let user = await getUserByFirebaseUid(firebaseUid);
    if (!user) {
      user = await createUser({
        firebaseUid,
        email: claims?.email || null,
        displayName: claims?.name || null,
        createdAt: new Date().toISOString(),
      });
    }

    if (!user) {
      return unauthorized("invalid session");
    }

    return json(
      buildAuthPayload({
        id: user.id || firebaseUid,
        firebaseUid,
        email: user.email ?? claims?.email ?? null,
        displayName: user.display_name || claims?.name || null,
        createdAt: user.created_at || new Date().toISOString(),
      }),
    );
  } catch {
    return unauthorized("invalid token");
  }
};

const requireUserContext = async (request, env) => {
  const token = extractBearerToken(request);
  if (!token) {
    return { response: unauthorized("missing token") };
  }

  if (typeof env.verifyFirebaseToken !== "function") {
    return { response: unauthorized("token verification is unavailable") };
  }

  try {
    const claims = await env.verifyFirebaseToken(token);
    const user = await readProfileFromEnv(env, claims?.uid);
    if (!claims?.uid || !user) {
      return { response: unauthorized("invalid session") };
    }

    return {
      user,
      response: null,
    };
  } catch {
    return { response: unauthorized("invalid token") };
  }
};

const handleGetProfile = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  const user = userContext.user;
  return json(
    profilePayload({
      id: user.id,
      firebaseUid: user.firebase_uid || user.firebaseUid || user.id,
      email: user.email || null,
      displayName: user.display_name || user.displayName || null,
      createdAt: user.created_at || user.createdAt || new Date().toISOString(),
    }),
  );
};

const handleUpdateProfile = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  const body = await parseJson(request);
  if (!body || (body.display_name === undefined && body.email === undefined)) {
    return badRequest("display_name or email is required");
  }

  const existing = userContext.user;
  const updates = {
    email: body.email ?? existing.email ?? null,
    display_name:
      body.display_name !== undefined
        ? body.display_name
        : existing.display_name || null,
  };

  const nextUser = await writeProfileToEnv(
    env,
    existing.firebase_uid || existing.firebaseUid || existing.id,
    updates,
  );
  const user = nextUser || {
    ...existing,
    ...updates,
  };

  return json(
    profilePayload({
      id: user.id,
      firebaseUid: user.firebase_uid || user.firebaseUid || user.id,
      email: user.email || null,
      displayName: user.display_name || user.displayName || null,
      createdAt: user.created_at || user.createdAt || new Date().toISOString(),
    }),
  );
};

const handleCreateHousehold = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  const body = await parseJson(request);
  const name = body?.name?.trim?.();
  if (!name) {
    return badRequest("name is required");
  }

  const user = userContext.user;
  if (typeof env.createHousehold !== "function") {
    return json(
      { error: "unavailable", message: "household store is unavailable" },
      { status: 503 },
    );
  }

  if (typeof env.addHouseholdMember !== "function") {
    return json(
      { error: "unavailable", message: "membership store is unavailable" },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const household = await env.createHousehold({
    id: crypto.randomUUID(),
    name,
    creatorUserId: user.id,
    createdAt: now,
    updatedAt: now,
  });
  const member = await env.addHouseholdMember({
    householdId: household.id || household.householdId,
    userId: user.id,
    role: "admin",
  });

  return json(
    householdPayload({ household, member }),
    { status: 201 },
  );
};

const ensureHouseholdAdmin = async (env, user, householdId) => {
  return requireHouseholdRole(env, user, householdId, "admin");
};

const handleCreateInvite = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  const body = await parseJson(request);
  const householdId = body?.household_id;
  if (!householdId) {
    return badRequest("household_id is required");
  }

  const guard = await ensureHouseholdAdmin(env, userContext.user, householdId);
  if (guard.response) {
    return guard.response;
  }

  if (typeof env.putInviteToken !== "function") {
    return json(
      { error: "unavailable", message: "invite store unavailable" },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const invite = {
    token: crypto.randomUUID(),
    household_id: householdId,
    inviter_user_id: userContext.user.id,
    invitee_email: body?.invitee_email || null,
    status: "pending",
    created_at: now,
    updated_at: now,
  };
  await env.putInviteToken(invite);

  return json({ invite }, { status: 201 });
};

const handleJoinHousehold = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  const body = await parseJson(request);
  const token = body?.token;
  if (!token) {
    return badRequest("token is required");
  }

  if (
    typeof env.getInviteToken !== "function" ||
    typeof env.markInviteAccepted !== "function" ||
    typeof env.addHouseholdMember !== "function"
  ) {
    return json(
      { error: "unavailable", message: "invite workflow unavailable" },
      { status: 503 },
    );
  }

  const invite = await env.getInviteToken(token);
  if (!invite) {
    return notFound();
  }

  if (invite.status !== "pending") {
    return conflict("invite is not pending");
  }

  if (invite.invitee_email && userContext.user.email && invite.invitee_email !== userContext.user.email) {
    return forbidden("invite token is bound to a different email");
  }

  if (typeof env.getHouseholdMembership === "function") {
    const existingMember = await env.getHouseholdMembership(
      invite.household_id,
      userContext.user.id,
    );
    if (existingMember) {
      return conflict("user already belongs to household");
    }
  }

  const member = await env.addHouseholdMember({
    householdId: invite.household_id,
    userId: userContext.user.id,
    role: "member",
  });

  await env.markInviteAccepted(token, {
    acceptedByUserId: userContext.user.id,
    acceptedAt: new Date().toISOString(),
  });

  return json({
    household_id: invite.household_id,
    member,
  }, { status: 201 });
};

const normalizeItemUpdate = (body) => {
  const updates = {};
  if (typeof body?.title === "string") {
    updates.title = body.title.trim();
  }
  if (typeof body?.recurrence === "string") {
    updates.recurrence = body.recurrence;
  }
  if (typeof body?.is_active === "boolean") {
    updates.is_active = body.is_active ? 1 : 0;
  }
  return updates;
};

const parseDateParam = (url) => {
  const date = url.searchParams.get("date");
  if (!date) {
    return { value: null, error: badRequest("date query is required") };
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, error: badRequest("invalid date") };
  }

  return { value: date, error: null };
};

const parseStartDateParam = (url) => {
  const date = url.searchParams.get("start");
  if (!date) {
    return { value: null, error: badRequest("start query is required") };
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, error: badRequest("invalid start date") };
  }

  return { value: date, error: null };
};

const requireHouseholdForItem = async (env, user, householdId) => {
  if (!householdId) {
    return { response: null };
  }

  return requireHouseholdMembership(env, user, householdId);
};

const handleCreateItem = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  const body = await parseJson(request);
  const title = body?.title?.trim?.();
  const recurrence = body?.recurrence;
  const householdId = body?.household_id || null;

  if (!title || !recurrence) {
    return badRequest("title and recurrence are required");
  }

  if (typeof env.createItem !== "function") {
    return json({ error: "unavailable", message: "item store unavailable" }, { status: 503 });
  }

  const membershipContext = await requireHouseholdForItem(env, userContext.user, householdId);
  if (membershipContext.response) {
    return membershipContext.response;
  }

  const now = new Date().toISOString();
  const item = await env.createItem({
    id: crypto.randomUUID(),
    household_id: householdId,
    owner_user_id: userContext.user.id,
    title,
    recurrence,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  return json({ item }, { status: 201 });
};

const handleGetItems = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  if (typeof env.listItemsForUser !== "function") {
    return json({ error: "unavailable", message: "item query unavailable" }, { status: 503 });
  }

  const items = await env.listItemsForUser(userContext.user.id);
  return json({ items });
};

const handlePatchItem = async (request, env, itemId) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  if (typeof env.getItemById !== "function" || typeof env.updateItem !== "function") {
    return json({ error: "unavailable", message: "item persistence unavailable" }, { status: 503 });
  }

  const current = await env.getItemById(itemId);
  if (!current) {
    return notFound();
  }

  const body = await parseJson(request);
  if (!body) {
    return badRequest("no update body");
  }

  if (current.owner_user_id !== userContext.user.id) {
    if (!current.household_id) {
      return forbidden("item owner required");
    }

    const membership = await requireHouseholdMembership(
      env,
      userContext.user,
      current.household_id,
    );
    if (membership.response) {
      return membership.response;
    }
  }

  const updates = normalizeItemUpdate(body);
  if (Object.keys(updates).length === 0) {
    return badRequest("no valid update fields");
  }

  const now = new Date().toISOString();
  const next = await env.updateItem(itemId, {
    ...updates,
    updated_at: now,
  });
  return json({ item: next });
};

const handleGetAgenda = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  if (typeof env.listItemsForUser !== "function") {
    return json({ error: "unavailable", message: "item query unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const parsedDate = parseDateParam(url);
  if (parsedDate.error) {
    return parsedDate.error;
  }

  const items = await env.listItemsForUser(userContext.user.id);
  const occurrences = items
    .filter((item) => Number(item.is_active) !== 0)
    .filter((item) =>
      expandRecurrence(
        item.recurrence,
        item.created_at?.slice(0, 10) || parsedDate.value,
        parsedDate.value,
      ).includes(parsedDate.value),
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      recurrence: item.recurrence,
      household_id: item.household_id,
      owner_user_id: item.owner_user_id,
    }));

  return json({
    date: parsedDate.value,
    items: occurrences,
  });
};

const toPercent = (completed, expected) => {
  if (expected === 0) {
    return 0;
  }

  return Math.round((completed / expected) * 10000) / 100;
};

const handleGetWeek = async (request, env) => {
  const userContext = await requireUserContext(request, env);
  if (userContext.response) {
    return userContext.response;
  }

  const url = new URL(request.url);
  const parsedDate = parseStartDateParam(url);
  if (parsedDate.error) {
    return parsedDate.error;
  }

  if (
    typeof env.listItemsForUser !== "function" ||
    typeof env.listCompletionsForUserInRange !== "function"
  ) {
    return json({ error: "unavailable", message: "week query unavailable" }, { status: 503 });
  }

  const weekStart = parsedDate.value;
  const parsedStart = new Date(`${weekStart}T00:00:00.000Z`);
  const weekEndDate = new Date(
    Date.UTC(
      parsedStart.getUTCFullYear(),
      parsedStart.getUTCMonth(),
      parsedStart.getUTCDate() + 6,
    ),
  );
  const weekEnd = weekEndDate.toISOString().slice(0, 10);
  const items = await env.listItemsForUser(userContext.user.id);
  const completions = await env.listCompletionsForUserInRange(
    userContext.user.id,
    weekStart,
    weekEnd,
  );

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
      const marker = `${item.id}:${date}`;
      expectedCount += 1;
      if (completionLookup.has(marker)) {
        completedCount += 1;
      }
    }
  }

  return json({
    start: weekStart,
    end: weekEnd,
    expected_count: expectedCount,
    completed_count: completedCount,
    progress_percent: toPercent(completedCount, expectedCount),
  });
};

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json(buildHealthPayload());
    }

    if (url.pathname === "/session/verify" && request.method === "POST") {
      return handleSessionVerify(request, env);
    }

    if (url.pathname === "/me" && request.method === "GET") {
      return handleGetProfile(request, env);
    }

    if (url.pathname === "/me" && request.method === "PUT") {
      return handleUpdateProfile(request, env);
    }

    if (
      (url.pathname === "/household" || url.pathname === "/households") &&
      request.method === "POST"
    ) {
      return handleCreateHousehold(request, env);
    }
    if (
      url.pathname === "/household/invites" &&
      request.method === "POST"
    ) {
      return handleCreateInvite(request, env);
    }
    if (url.pathname === "/household/join" && request.method === "POST") {
      return handleJoinHousehold(request, env);
    }
    if (url.pathname === "/items" && request.method === "GET") {
      return handleGetItems(request, env);
    }
    if (url.pathname === "/items" && request.method === "POST") {
      return handleCreateItem(request, env);
    }
    if (url.pathname.startsWith("/items/") && request.method === "PATCH") {
      const itemId = url.pathname.split("/")[2];
      if (!itemId) {
        return notFound();
      }
      return handlePatchItem(request, env, itemId);
    }
    if (url.pathname === "/agenda" && request.method === "GET") {
      return handleGetAgenda(request, env);
    }
    if (url.pathname === "/week" && request.method === "GET") {
      return handleGetWeek(request, env);
    }

    return notFound();
  },
};
