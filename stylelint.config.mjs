/** Lints the Tailwind entry CSS (src/*.css). The compiled assets/site.css is never linted. */
/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-standard"],
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "theme",
          "source",
          "utility",
          "variant",
          "custom-variant",
          "apply",
          "reference",
          "plugin",
          "config",
          "slot",
        ],
      },
    ],
    "at-rule-no-deprecated": [true, { ignoreAtRules: ["apply"] }],
    "import-notation": "string",
    "hue-degree-notation": null,
    "declaration-no-important": [true, { severity: "warning" }],
    "selector-max-id": 0,
    // Tailwind theme keys use "--" sub-keys, e.g. --text-step-0--line-height.
    "custom-property-pattern": [
      "^[a-z0-9]+(-{1,2}[a-z0-9]+)*$",
      { message: "Use kebab-case tokens." },
    ],
    // @custom-variant blocks use bare & with @slot.
    "nesting-selector-no-missing-scoping-root": null,
    "value-keyword-case": ["lower", { ignoreProperties: ["/^--font-/", "font-family"] }],
    "declaration-property-value-disallowed-list": { "/^outline(-style)?$/": ["none", "0"] },
  },
  overrides: [
    {
      // Reduced-motion override is the one place !important is required.
      files: ["src/input.css"],
      rules: { "declaration-no-important": null },
    },
  ],
};
