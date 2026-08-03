import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Issue 136 — test-only stub so mobile/lib/haptics.ts's pure decision
      // logic is exercisable in the node test env without pulling in
      // react-native. NOT shipped; the real expo-haptics runs in the app.
      "expo-haptics": path.resolve(__dirname, "./tests/__stubs__/expo-haptics.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests boot an embedded PostgreSQL engine (withIsolatedPostgres);
    // the 5s vitest default times out whenever parallel files contend for the
    // pg binary. 30s keeps the suite honest on a loaded machine.
    testTimeout: 30_000,
  },
});
