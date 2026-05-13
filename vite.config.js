import { defineConfig } from "vite";

export default defineConfig({
  root: "wwwroot",
  publicDir: false,
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
      "/ordersHub": {
        target: "http://localhost:5000",
        ws: true
      }
    }
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
