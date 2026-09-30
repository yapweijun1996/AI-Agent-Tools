import tsParser from "@typescript-eslint/parser";

const commonRules = {
  "no-constant-condition": "error",
  "no-debugger": "error",
  "no-eval": "error",
  "no-new-func": "error",
  "no-trailing-spaces": "error",
  "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  quotes: ["error", "double"],
};

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: commonRules,
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: commonRules,
  },
];
