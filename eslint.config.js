import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

// Math functions whose results are not guaranteed bit-identical across JavaScript engines.
const NON_EXACT_MATH = [
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "atan2",
    "sinh",
    "cosh",
    "tanh",
    "asinh",
    "acosh",
    "atanh",
    "exp",
    "expm1",
    "log",
    "log1p",
    "log2",
    "log10",
    "pow",
    "cbrt",
    "hypot",
];
const DETERMINISM_MESSAGE =
    "Engine code must use IEEE-exact operations only (+ - * /, Math.sqrt) so results are identical across browsers.";

export default defineConfig(
    { ignores: ["dist/", "coverage/", "playwright-report/", "test-results/", ".superpowers/"] },
    js.configs.recommended,
    tseslint.configs.strict,
    {
        files: ["**/*.ts", "**/*.js", "**/*.svelte"],
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    svelte.configs.recommended,
    prettier,
    svelte.configs.prettier,
    { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
    {
        files: ["**/*.svelte", "**/*.svelte.ts"],
        languageOptions: { parserOptions: { parser: tseslint.parser } },
    },
    {
        files: ["src/engine/**/*.ts"],
        rules: {
            "no-restricted-properties": [
                "error",
                ...NON_EXACT_MATH.map((property) => ({ object: "Math", property, message: DETERMINISM_MESSAGE })),
                { object: "Math", property: "random", message: DETERMINISM_MESSAGE },
            ],
            "no-restricted-globals": [
                "error",
                { name: "Date", message: DETERMINISM_MESSAGE },
                { name: "performance", message: DETERMINISM_MESSAGE },
            ],
            "no-restricted-syntax": [
                "error",
                { selector: "VariableDeclarator[init.name='Math'] > ObjectPattern", message: DETERMINISM_MESSAGE },
                { selector: "BinaryExpression[operator='**']", message: DETERMINISM_MESSAGE },
                { selector: "AssignmentExpression[operator='**=']", message: DETERMINISM_MESSAGE },
            ],
        },
    },
);
