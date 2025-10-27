import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";


export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], languageOptions: { globals: globals.browser } },
  {
    // 针对 TypeScript 文件的配置
    files: ["**/*.{ts,tsx,mts,cts}"],
    ...tseslint.configs.recommended,
    rules: {
      // 继承 tseslint 的 rules
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
]);
