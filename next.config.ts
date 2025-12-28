import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Temporarily removed 'output: export' to enable middleware and API routes
  // TODO: Create separate build configs for mobile (static) and web (server)
  images: {
    unoptimized: true
  },
  trailingSlash: true
};

export default nextConfig;
