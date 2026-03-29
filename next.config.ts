import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // output: 'export',
  // Temporarily removed 'output: export' to enable middleware and API routes
  // TODO: Create separate build configs for mobile (static) and web (server)
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true
  },
  // trailingSlash: true  // Disabled: conflicts with Clerk sign-in/sign-up routing
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
});
