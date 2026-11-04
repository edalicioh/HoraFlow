import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "server-only": path.resolve(
        process.cwd(),
        "tests/helpers/server-only-empty.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: false,
  },
});
