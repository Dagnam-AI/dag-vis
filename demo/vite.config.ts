import { defineConfig } from "vite";

export default defineConfig({
  // 5173 is the port the Playwright configs expect.
  server: { port: 5173, strictPort: true },
});
