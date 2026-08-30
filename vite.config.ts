import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@/routes/desktopRoutes": path.resolve(
        import.meta.dirname,
        "client",
        "src",
        "routes",
        "desktopRoutes.lazy.tsx",
      ),
      "@/lib/route-prefetch": path.resolve(
        import.meta.dirname,
        "client",
        "src",
        "lib",
        "route-prefetch.ts",
      ),
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "/",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
  },
}));
