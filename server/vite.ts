import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const resolvedViteConfig = typeof viteConfig === "function"
    ? await viteConfig({ command: "serve", mode: "development" })
    : viteConfig;
  const serverOptions = {
    middlewareMode: true,
    // The Replit preview proxy exposes the app on its configured port while
    // Vite's middleware server otherwise advertises its internal 5173 port.
    // Pinning the client port prevents the browser's failed localhost:5173
    // fallback and keeps the websocket same-origin through the proxy.
    hmr: {
      server,
      path: "/vite-hmr",
      clientPort: Number(process.env.PORT || 5000),
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Catch-all handler for SPA - use middleware instead of "*" path
  app.use(async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API and auth routes - let Express handle them
    if (url.startsWith('/api') || url.startsWith('/auth')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
