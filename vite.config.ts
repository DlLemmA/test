import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, process.cwd()).VITE_BASE_PATH || "/test/";

  return {
    base,
    plugins: [
      vue({
        template: {
          // Vue's SFC compiler predates the native <search> landmark and would
          // otherwise try to resolve it as a component at runtime.
          compilerOptions: { isCustomElement: (tag) => tag === "search" },
        },
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    test: {
      include: ["src/**/*.test.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text-summary", "json-summary", "html", "lcov"],
        reportsDirectory: "coverage",
        include: ["src/**/*.ts", "src/**/*.vue"],
      },
    },
  };
});
