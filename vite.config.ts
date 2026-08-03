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
    coverage: {
      provider: "v8",
      include: [
        "src/lib/accounting-rules.ts",
        "src/lib/integrated-tax.ts",
        "src/lib/vat.ts",
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
        branches: 70,
        functions: 78,
        lines: 75,
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
