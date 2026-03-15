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

const profilePayload = ({ id, email, displayName, createdAt, firebaseUid }) => ({
  user: {
    id,
    firebase_uid: firebaseUid,
    email,
    display_name: displayName,
    created_at: createdAt,
  },
});

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

    return notFound();
  },
};
