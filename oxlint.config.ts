import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "import", "vitest", "vue"],
  categories: {
    correctness: "error",
    suspicious: "warn",
    perf: "warn",
  },
  rules: {},
  env: {
    builtin: true,
    browser: true,
    node: true,
    vue: true,
  },
});
