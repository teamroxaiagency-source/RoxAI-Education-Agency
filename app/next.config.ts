import type { NextConfig } from "next";
import type { Configuration } from "webpack";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  webpack(config: Configuration) {
    // @sentry/nextjs pulls in OpenTelemetry instrumentation packages that
    // use dynamic requires — a known, harmless warning
    // (getsentry/sentry-javascript#8483), not a real problem with our code.
    config.ignoreWarnings = [{ message: /Critical dependency: the request of a dependency is an expression/ }];
    return config;
  },
};

export default nextConfig;
