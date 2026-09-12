import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: ["SoleTrader/**", "e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/accounting-rules.ts",
        "src/lib/bank-review.ts",
        "src/lib/tax-estimate.ts",
        "src/lib/queries/vat.ts",
        "src/lib/capital-allowances.ts",
        "src/lib/report-calculations.ts",
        "src/lib/bank-import.ts",
        "src/lib/migration-import.ts",
        "src/lib/accountant-package.ts",
        "src/lib/report-export.ts",
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 75,
        branches: 69,
        functions: 75,
        lines: 75,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/@tanstack/")
          )
            return "framework";
          if (id.includes("/@radix-ui/")) return "ui";
          if (id.includes("/recharts/") || id.includes("/d3-")) return "charts";
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
