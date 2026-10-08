import js from "@eslint/js";
import globals from "globals";
import htmlParser from "@html-eslint/parser";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import { defineConfig, globalIgnores } from "eslint/config";

const tailwindSettings = {
  "better-tailwindcss": { entryPoint: "src/input.css" },
};

export default defineConfig([
  globalIgnores([
    "public/assets/",
    "node_modules/",
    "assets/",
    "bin/",
    ".lighthouseci/",
    "test-results/",
    "playwright-report/",
    // Vendored third-party agent skills; integrity is checked by scripts/check-skills.sh.
    ".agents/",
    ".claude/",
    ".cursor/",
  ]),

  // Vanilla JS: modules, browser globals, no XSS sinks.
  {
    files: ["public/js/**/*.js"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      "no-implicit-globals": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-alert": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-restricted-properties": [
        "error",
        { object: "document", property: "write", message: "Never use document.write." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
          message: "XSS sink: use textContent, replaceChildren(), or <template> cloning.",
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: "XSS sink: build nodes with DOM APIs instead.",
        },
      ],
    },
  },

  // Tailwind classes in HTML: unknown, conflicting, duplicate, deprecated, physical-direction classes.
  {
    files: ["**/*.html"],
    languageOptions: { parser: htmlParser },
    plugins: { "better-tailwindcss": betterTailwind },
    settings: tailwindSettings,
    rules: {
      ...betterTailwind.configs["correctness-error"].rules,
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-deprecated-classes": "error",
      "better-tailwindcss/enforce-canonical-classes": "error",
      "better-tailwindcss/enforce-logical-properties": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              pattern: "^outline-none$",
              message: "Never remove focus outlines; style :focus-visible instead.",
            },
            {
              pattern: "^(.*:)?text-\\[\\d+px\\]$",
              message: "Use the fluid text-step-* scale, not fixed px.",
            },
          ],
        },
      ],
    },
  },

  // Node-side config files and Playwright tests.
  {
    files: ["*.config.{js,mjs}", "eslint.config.js", "tests/**/*.js"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
  },
  {
    // Playwright page.evaluate() callbacks run in the browser.
    files: ["tests/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
]);
