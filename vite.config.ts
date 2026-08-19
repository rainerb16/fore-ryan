import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * In production Netlify serves netlify/functions at these paths. In dev nothing
 * would, so `npm run dev` would only ever exercise the offline path. This mounts
 * the same handlers on the Vite dev server, which means one command runs the
 * whole thing against a real Supabase project — no Netlify CLI, no deploy.
 *
 * Values come from a local .env file, which is gitignored.
 */
// A Map, not an object literal: request paths are attacker-controlled, and
// ROUTES["__proto__"] on a plain object resolves to something truthy.
const ROUTES = new Map([
  ["/api/run-start", "/netlify/functions/run-start.ts"],
  ["/api/submit-run", "/netlify/functions/submit-run.ts"],
  ["/api/leaderboard", "/netlify/functions/leaderboard.ts"],
]);

function toRequest(req: IncomingMessage, body: Buffer | undefined): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, value);
  }
  const method = req.method ?? "GET";
  return new Request(`http://localhost${req.url ?? "/"}`, {
    method,
    headers,
    // Buffer is a Uint8Array, but the DOM lib's BodyInit does not know that.
    body: method === "GET" || method === "HEAD" || !body ? undefined : new Uint8Array(body),
  });
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function netlifyFunctionsDev(): Plugin {
  return {
    name: "netlify-functions-dev",
    apply: "serve",

    config(_config, { mode }) {
      // The handlers read process.env, so bring .env into it before they load.
      Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
    },

    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url ?? "/").split("?")[0];
        const modulePath = ROUTES.get(path);
        if (!modulePath) return next();

        void (async () => {
          try {
            const body = await readBody(req);
            // ssrLoadModule compiles the TypeScript handler on the fly, so dev
            // runs exactly the source that Netlify will bundle.
            const mod = (await server.ssrLoadModule(modulePath)) as {
              default: (request: Request) => Promise<Response>;
            };
            const response = await mod.default(toRequest(req, body));

            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (err) {
            // Surface the real reason — this only ever runs on a dev machine.
            const message = err instanceof Error ? err.message : String(err);
            server.config.logger.error(`[api] ${path} failed: ${message}`);
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: message }));
          }
        })();
      });
    },
  };
}

export default defineConfig({
  plugins: [netlifyFunctionsDev()],
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
