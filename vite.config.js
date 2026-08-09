import { createReadStream, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const PIPER_PATH = "/piper-tts-web.js";
const PIPER_FILE = resolve(process.cwd(), "public/piper-tts-web.js");

function servePublicPiperModule() {
  return {
    name: "serve-public-piper-module",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" || !request.url) {
          next();
          return;
        }

        const url = new URL(request.url, "http://vite.local");
        if (url.pathname !== PIPER_PATH || !url.searchParams.has("import")) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", "application/javascript; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Content-Length", String(statSync(PIPER_FILE).size));
        createReadStream(PIPER_FILE).on("error", next).pipe(response);
      });
    },
  };
}

export default defineConfig({
  plugins: [servePublicPiperModule()],
});
