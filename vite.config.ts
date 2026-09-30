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
    },
});
