import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

function manualChunks(id: string): string | undefined {
  const normalizedId = id.replaceAll("\\", "/");

  if (normalizedId.includes("/node_modules/")) {
    if (normalizedId.includes("/@floating-ui/")) {
      return "vendor-ui";
    }

    if (
      normalizedId.includes("/react/") ||
      normalizedId.includes("/react-dom/") ||
      normalizedId.includes("/scheduler/") ||
      normalizedId.includes("/wouter/") ||
      normalizedId.includes("/zustand/")
    ) {
      return "vendor-react";
    }

    if (normalizedId.includes("/framer-motion/")) {
      return "vendor-motion";
    }

    if (
      normalizedId.includes("/recharts/") ||
      normalizedId.includes("/d3-") ||
      normalizedId.includes("/victory-")
    ) {
      return "vendor-charts";
    }

    if (
      normalizedId.includes("/@tanstack/") ||
      normalizedId.includes("/date-fns/") ||
      normalizedId.includes("/zod/") ||
      normalizedId.includes("/react-hook-form/") ||
      normalizedId.includes("/@hookform/")
    ) {
      return "vendor-data";
    }

    if (
      normalizedId.includes("/@radix-ui/") ||
      normalizedId.includes("/lucide-react/") ||
      normalizedId.includes("/cmdk/") ||
      normalizedId.includes("/embla-carousel") ||
      normalizedId.includes("/input-otp/") ||
      normalizedId.includes("/react-day-picker/") ||
      normalizedId.includes("/react-resizable-panels/") ||
      normalizedId.includes("/sonner/") ||
      normalizedId.includes("/vaul/")
    ) {
      return "vendor-ui";
    }

    // Leave less common packages in Rollup's normal shared graph. Forcing
    // every remaining dependency into one catch-all vendor chunk creates
    // circular chunks with React and makes shared application modules larger.
    return undefined;
  }

  if (normalizedId.includes("/client/src/lib/i18n.tsx")) {
    return "i18n-core";
  }

  if (normalizedId.includes("/client/src/lib/firstRunTranslations.ts")) {
    return "i18n-first-run";
  }

  const publicTranslationsMatch = normalizedId.match(
    /\/client\/src\/lib\/publicWebsiteTranslations\/([^/]+)\.ts$/,
  );
  if (publicTranslationsMatch) {
    return `i18n-public-${publicTranslationsMatch[1]}`;
  }

  if (normalizedId.includes("/client/src/lib/featureTranslations.ts")) {
    return "i18n-features";
  }

  if (normalizedId.includes("/client/src/lib/appTranslations.ts")) {
    return "i18n-app";
  }

  if (normalizedId.includes("/client/src/lib/authenticatedTranslations/")) {
    return "i18n-authenticated";
  }

  // Keep Electron routes eager from the app's perspective, but place each
  // page in its own relative chunk. This keeps file:// navigation reliable
  // while preventing every page from inflating the entry chunk.
  const pageMatch = normalizedId.match(
    /\/client\/src\/pages\/([^/]+)\.(?:tsx?|jsx?)$/,
  );
  if (pageMatch) {
    return `page-${pageMatch[1].replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  }

  return undefined;
}

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
        mode === "electron" ? "desktopRoutes.eager.tsx" : "desktopRoutes.lazy.tsx",
      ),
      "@/lib/route-prefetch": path.resolve(
        import.meta.dirname,
        "client",
        "src",
        "lib",
        mode === "electron" ? "route-prefetch.eager.ts" : "route-prefetch.ts",
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
    // The first-run catalog is intentionally synchronous because legal
    // content must be available before onboarding can continue. It measures
    // 517 KB minified; keep this ceiling narrow and below 600 KB so a future
    // accidental growth still fails the build warning.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
  },
}));
