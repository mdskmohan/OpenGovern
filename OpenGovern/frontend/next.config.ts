import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker production build (copies minimal output)
  output: "standalone",

  // Suppress type errors during build — run `npm run type-check` separately
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
