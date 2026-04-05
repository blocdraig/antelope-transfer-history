import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { nodePolyfills } from "vite-plugin-node-polyfills"

// https://vite.dev/config/
// Dev-only CORS workaround: in Custom endpoints, use e.g.
// `http://localhost:5173/__antelope/hyperion/eos` as the Hyperion URL (same origin → proxied).
export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/__antelope/hyperion/eos": {
        target: "https://eos.hyperion.eosrio.io",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__antelope\/hyperion\/eos/, ""),
      },
      "/__antelope/hyperion/wax": {
        target: "https://hyperion.waxsweden.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__antelope\/hyperion\/wax/, ""),
      },
      "/__antelope/hyperion/telos": {
        target: "https://telos.hyperion.eosrio.io",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__antelope\/hyperion\/telos/, ""),
      },
    },
  },
})
