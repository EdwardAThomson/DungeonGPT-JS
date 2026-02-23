import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    frontend: {
      entry: [
        "src/routes/**/*.tsx",
        "src/api/*.ts",
        "src/stores/*.ts",
        "src/design-system/**/*.{ts,tsx}",
        "src/game/**/*.ts",
        "src/lib/*.ts",
        "src/pages/game/components/**/*.{ts,tsx}",
        "src/hooks/*.ts",
        "src/data/*.ts",
      ],
      project: ["src/**/*.{ts,tsx}"],
      ignoreDependencies: [
        // Radix primitives — installed for future shadcn components
        "@radix-ui/react-popover",
        "@radix-ui/react-separator",
        // TanStack — used by game pages, not all directly imported yet
        "@tanstack/pacer",
        "@tanstack/react-form",
        "@tanstack/react-virtual",
        // Sanitization utility
        "dompurify",
        // Used implicitly by @tailwindcss/vite plugin
        "tailwindcss",
        // Type packages
        "@types/dompurify",
      ],
    },
    backend: {
      project: ["src/**/*.ts"],
    },
    shared: {
      project: ["src/**/*.ts"],
    },
  },
  ignore: [".project/**"],
};

export default config;
