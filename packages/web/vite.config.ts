import { readdirSync } from "node:fs"
import babel from "@rolldown/plugin-babel"
import stylex from "@stylexjs/unplugin"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"

const clientInputs = readdirSync(new URL("./src/client", import.meta.url))
  .filter((name) => /^[a-z]+\.(ts|tsx)$/.test(name))
  .sort()
  .map((name) => `src/client/${name}`)

// Vite only bundles here; the Effect HTTP server in src/server/main.ts serves
// pages, the API and the built client files.
export default defineConfig({
  plugins:
    lazyPlugins(() => [react(), stylex.vite(), babel({ presets: [reactCompilerPreset()] })]) ?? [],
  builder: {},
  environments: {
    // Emit Astryx CSS through Vite so package imports and asset URLs are resolved.
    client: {
      build: {
        outDir: "dist/client",
        manifest: true,
        cssCodeSplit: false,
        rolldownOptions: {
          input: clientInputs,
        },
      },
    },
    ssr: {
      build: {
        outDir: "dist/server",
        copyPublicDir: false,
        rolldownOptions: {
          input: "src/server/main.ts",
          output: { entryFileNames: "[name].js" },
        },
      },
    },
  },
})
