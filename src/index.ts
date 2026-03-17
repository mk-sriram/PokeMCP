import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { authenticateRequest } from "./auth";
import { registerPlanRouteDayTool } from "./mcp/tools/planRouteDay";

type Env = {
  POKE_API_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, x-api-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "poke-planner-mcp",
    version: "0.1.0",
  });

  registerPlanRouteDayTool(server, env);
  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    void ctx;
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/") {
      return withCors(
        Response.json({
          ok: true,
          name: "poke-planner-mcp",
          endpoint: "/mcp",
        }),
      );
    }

    if (url.pathname !== "/mcp") {
      return withCors(new Response("Not found", { status: 404 }));
    }

    // Stateless Workers cannot hold open SSE streams. Reject GET so the
    // runtime never hangs waiting for a stream that will never close.
    if (request.method === "GET" || request.method === "DELETE") {
      return withCors(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed on stateless server." }, id: null }),
          { status: 405, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    if (request.method !== "POST") {
      return withCors(new Response("Method not allowed.", { status: 405 }));
    }

    const authError = authenticateRequest(request, env);

    if (authError) {
      return withCors(authError);
    }

    try {
      const server = createServer(env);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      return withCors(await transport.handleRequest(request));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to handle MCP request.";

      return withCors(new Response(message, { status: 500 }));
    }
  },
};
