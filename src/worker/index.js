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

const parseJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
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

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (url.pathname !== "/health" || request.method !== "GET") {
      if (url.pathname === "/session/verify" && request.method === "POST") {
        return handleSessionVerify(request, env);
      }

      return notFound();
    }

    return json(buildHealthPayload());
  },
};
