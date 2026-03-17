# Poke Planner MCP

Generate a `POKE_API_KEY` with:

```bash
npm run generate:poke-secret
```

Add that value to local development in `.dev.vars`:

```env
POKE_API_KEY=your-generated-secret
```

Add the same value to Cloudflare Workers:

```bash
npx wrangler secret put POKE_API_KEY
```

Clients should send that value as either:

- `Authorization: Bearer <POKE_API_KEY>`
- `x-api-key: <POKE_API_KEY>`
