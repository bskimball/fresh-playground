import { readdirSync } from "node:fs"
import babel from "@rolldown/plugin-babel"
import stylex from "@stylexjs/unplugin"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"
import { effectDevServer } from "./src/server/devServer.ts"

const clientInputs = readdirSync(new URL("./src/client", import.meta.url))
  .filter((name) => /^[a-z]+\.(ts|tsx)$/.test(name))
  .sort()
  .map((name) => `src/client/${name}`)

// The Effect HTTP server owns routing. `vp build --app` bundles it as
// src/server/main.ts, which serves the built client files; `vp dev` hosts it from
// source through effectDevServer, with HMR.
export default defineConfig({
  plugins:
    lazyPlugins(() => [
      react(),
      stylex.vite(),
      babel({ presets: [reactCompilerPreset()] }),
      effectDevServer(),
    ]) ?? [],
  builder: {},
  // No index.html: start the dependency scan at the browser entry, which reaches
  // every island through the registry's lazy imports.
  optimizeDeps: { entries: ["src/client/performance.ts"] },
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
          // The island registry's lazy loaders target modules the server already imports to render.
          checks: { ineffectiveDynamicImport: false },
        },
      },
    },
  },
})
