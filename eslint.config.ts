import type { Linter } from "eslint";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import unicornPlugin from "eslint-plugin-unicorn";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import importXPlugin from "eslint-plugin-import-x";
import regexpPlugin from "eslint-plugin-regexp";
import securityPlugin from "eslint-plugin-security";
import noUnsanitizedPlugin from "eslint-plugin-no-unsanitized";
import prettierConfig from "eslint-config-prettier";

const config: Linter.Config[] = [
  // ── Global ignores ────────────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      // Ignore generated files
      "**/routeTree.gen.ts",
      // Ignore legacy CRA source files
      "src/**",
      "public/**",
      "server/**",
    ],
  },

  // ── Base TypeScript config for all packages ───────────────────────────
  ...tseslint.configs.strictTypeChecked.map((cfg) => ({
    ...cfg,
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((cfg) => ({
    ...cfg,
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
  })),

  // ── TypeScript — all packages ─────────────────────────────────────────
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Zero tolerance for `any`
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // Strict typing
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: false,
          allowNullish: false,
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],

      // Allow empty export in shared/src/index.ts during scaffold
      "@typescript-eslint/no-empty-function": "error",
    },
  },

  // ── Security plugin — all packages ────────────────────────────────────
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
    plugins: {
      security: securityPlugin,
    },
    rules: {
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-possible-timing-attacks": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-non-literal-fs-filename": "error",
    },
  },

  // ── No-unsanitized plugin — all packages ──────────────────────────────
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
    plugins: {
      "no-unsanitized": noUnsanitizedPlugin,
    },
    rules: {
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
    },
  },

  // ── Unicorn plugin — all packages ─────────────────────────────────────
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
    plugins: {
      unicorn: unicornPlugin,
    },
    rules: {
      // Enable recommended rules as errors
      ...Object.fromEntries(
        Object.entries(unicornPlugin.configs?.recommended?.rules ?? {}).map(
          ([key, value]) => [key, value === "off" ? "off" : "error"],
        ),
      ),
      // Customizations
      "unicorn/filename-case": [
        "error",
        {
          cases: {
            kebabCase: true,
            pascalCase: true,
          },
        },
      ],
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/no-useless-undefined": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/no-abusive-eslint-disable": "error",
    },
  },

  // ── SonarJS plugin — all packages ─────────────────────────────────────
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
    plugins: {
      sonarjs: sonarjsPlugin,
    },
    rules: {
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/prefer-immediate-return": "error",
      "sonarjs/no-redundant-jump": "error",
    },
  },

  // ── Import-X plugin — all packages ────────────────────────────────────
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
    plugins: {
      "import-x": importXPlugin,
    },
    rules: {
      "import-x/no-duplicates": "error",
      "import-x/no-self-import": "error",
      "import-x/no-cycle": "off",
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

  // ── Regexp plugin — all packages ──────────────────────────────────────
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
    ...regexpPlugin.configs["flat/recommended"],
    rules: {
      ...regexpPlugin.configs["flat/recommended"].rules,
      // Upgrade warnings to errors
      ...Object.fromEntries(
        Object.entries(
          regexpPlugin.configs["flat/recommended"].rules ?? {},
        ).map(([key, value]) => [key, value === "warn" ? "error" : value]),
      ),
    },
  },

  // ── React + JSX-A11y — frontend only ──────────────────────────────────
  {
    files: ["frontend/src/**/*.ts", "frontend/src/**/*.tsx"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React
      "react/jsx-no-target-blank": "error",
      "react/jsx-no-script-url": "error",
      "react/no-danger": "error",
      "react/no-danger-with-children": "error",
      "react/self-closing-comp": "error",
      "react/jsx-boolean-value": ["error", "never"],
      "react/jsx-curly-brace-presence": [
        "error",
        { props: "never", children: "never" },
      ],
      "react/jsx-no-useless-fragment": "error",
      "react/react-in-jsx-scope": "off",

      // React Hooks
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // Accessibility
      ...Object.fromEntries(
        Object.entries(jsxA11yPlugin.flatConfigs.strict.rules ?? {}).map(
          ([key, value]) => {
            if (Array.isArray(value)) {
              return [key, ["error", ...value.slice(1)]];
            }
            return [key, value === "off" ? "off" : "error"];
          },
        ),
      ),
    },
  },

  // ── Prettier (must be last — disables conflicting rules) ──────────────
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "backend/src/**/*.ts",
      "shared/src/**/*.ts",
    ],
    ...prettierConfig,
  },
];

export default config;
