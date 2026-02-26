import js from "@eslint/js";
import globals from "globals";
import security from "eslint-plugin-security";

export default [
  {
    ignores: ["node_modules/**", "data/**", "dist/**", "src/vendor/**"],
  },
  js.configs.recommended,
  security.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
        Chart: "readonly",
        WKBLDatabase: "readonly",
        initSqlJs: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];
