import { defineConfig } from "vite-plus"

export default defineConfig({
  fmt: {
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    endOfLine: "lf",
    semi: false,
    singleQuote: false,
    trailingComma: "all",
    arrowParens: "always",
    ignorePatterns: ["**/dist/**", "package-lock.json"],
  },
  lint: {
    ignorePatterns: ["**/dist/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
})
