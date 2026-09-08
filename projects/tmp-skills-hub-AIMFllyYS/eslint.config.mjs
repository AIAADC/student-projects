import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo", ".sandbox/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 项目铁律:禁止 any,用 unknown + 类型收窄
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@skills-hub/core", "@skills-hub/core/*"], message: "web 不直接 import core——数据走 HTTP /api（project-structure.md §二）" },
            { group: ["@skills-hub/cli", "@skills-hub/cli/*"], message: "web 不直接 import cli——数据走 HTTP /api（project-structure.md §二）" },
          ],
        },
      ],
    },
  },
  {
    // CLI 是终端程序,console 是它的正常输出通道
    files: ["packages/cli/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        WebSocket: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: { "no-console": "off" },
  },
);
