import babel from "@rolldown/plugin-babel"
import stylex from "@stylexjs/unplugin"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"

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
          input: [
            "src/client/garden.tsx",
            "src/client/about.ts",
            "src/client/login.tsx",
            "src/client/admin.tsx",
            "src/client/performance.ts",
            "src/client/sw.ts",
          ],
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
