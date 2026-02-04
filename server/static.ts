import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname);
  const rootPublicPath = path.resolve(process.cwd(), "public");
  
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve sitemap.xml from root public folder with correct content type
  app.get("/sitemap.xml", (_req, res) => {
    const sitemapPath = path.join(rootPublicPath, "sitemap.xml");
    if (fs.existsSync(sitemapPath)) {
      res.setHeader("Content-Type", "application/xml");
      res.sendFile(sitemapPath);
    } else {
      res.status(404).send("Sitemap not found");
    }
  });

  // Serve other static assets from root public folder (logos, etc.)
  app.use(express.static(rootPublicPath));
  
  // Serve built client assets
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist (but not for API routes or OPTIONS)
  app.use((req, res, next) => {
    // Don't catch API routes or OPTIONS preflight requests
    if (req.path.startsWith('/api') || req.method === 'OPTIONS') {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
