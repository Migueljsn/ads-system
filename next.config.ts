import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    rules: {
      // loaders rodam da direita para a esquerda: Tailwind primeiro, depois tiramos os @layer (TVs não entendem)
      "*.css": { loaders: [path.resolve("scripts/css-legacy-loader.cjs"), "@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
