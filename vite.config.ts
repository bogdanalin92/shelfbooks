import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Disable Cloudflare Workers bundling — we target Node.js / Docker instead.
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
  },
});
