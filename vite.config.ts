import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
    base: "./",
    plugins: [svelte()],
    build: {
        target: ["es2022", "safari16", "chrome120", "edge120", "firefox120"],
    },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
        // CI's 60 s (.github/workflows/ci.yml). Soft follow-through design §2.1 (was 15 s, 4× the slowest test then): the
        // late hits the catch now sees hold the rolls' impacts open, and under the full suite's contention tests on
        // this default take up to 18 s alone. Slower tests set their own timeouts.
        testTimeout: 60_000,
    },
});
