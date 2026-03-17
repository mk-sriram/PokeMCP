type EnvWithApiKey = {
  POKE_API_KEY?: string;
};

function getProvidedApiKey(request: Request): string | null {
  const rawAuthorization = request.headers.get("authorization");

  if (rawAuthorization?.startsWith("Bearer ")) {
    return rawAuthorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-api-key");
}

export function authenticateRequest(
  request: Request,
  env: EnvWithApiKey,
): Response | null {
  const expectedApiKey = env.POKE_API_KEY;

  if (!expectedApiKey) {
    return new Response("Missing POKE_API_KEY secret.", { status: 500 });
  }

  const providedApiKey = getProvidedApiKey(request);

  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="poke-planner-mcp"',
      },
    });
  }

  return null;
}
