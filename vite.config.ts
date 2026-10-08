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
        // 4× the slowest test on this default (3.4 s locally, buildContact's solver test), rounded up: CI's runners
        // measured 2–3× slower. Slower tests set their own timeouts.
        testTimeout: 15_000,
    },
});
