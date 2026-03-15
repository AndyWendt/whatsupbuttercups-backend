const buildHealthPayload = () => ({
  service: "whatsupbuttercups-backend",
  status: "ok",
  timestamp: new Date().toISOString(),
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

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/health" || request.method !== "GET") {
      return notFound();
    }

    return json(buildHealthPayload());
  },
};
