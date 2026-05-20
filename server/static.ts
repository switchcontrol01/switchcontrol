import express, { type Express } from "express";
import fs from "fs";
import path from "path";

const FAVICON_BASENAMES = new Set([
  "favicon.ico",
  "favicon.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "icon.ico",
  "icon-256.png",
  "icon-rounded.png",
  "og-image.png",
  "opengraph.jpg",
  "site.webmanifest",
  "robots.txt",
]);

function setPublicCacheHeaders(res: express.Response, filePath: string) {
  const basename = path.basename(filePath);
  if (FAVICON_BASENAMES.has(basename)) {
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=2592000");
  }
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname);
  const rootPublicPath = path.resolve(process.cwd(), "public");
  
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve sitemap.xml with correct content type + public cache
  app.get("/sitemap.xml", (_req, res) => {
    const sitemapPath = path.join(distPath, "sitemap.xml");
    const fallbackPath = path.join(rootPublicPath, "sitemap.xml");
    const filePath = fs.existsSync(sitemapPath) ? sitemapPath : fallbackPath;
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.sendFile(filePath);
    } else {
      res.status(404).send("Sitemap not found");
    }
  });

  // Serve other static assets from root public folder (logos, brand images, etc.)
  app.use(express.static(rootPublicPath, {
    setHeaders: setPublicCacheHeaders,
  }));
  
  // Serve built client assets (favicon, icons, JS/CSS bundles, etc.)
  app.use(express.static(distPath, {
    setHeaders: setPublicCacheHeaders,
  }));

  // fall through to index.html if the file doesn't exist (but not for API routes or OPTIONS)
  app.use((req, res, next) => {
    // Don't catch API routes or OPTIONS preflight requests
    if (req.path.startsWith('/api') || req.method === 'OPTIONS') {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
