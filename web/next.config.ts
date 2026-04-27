import path from "node:path";
import type { NextConfig } from "next";

const apiProxyBaseUrl = process.env.API_PROXY_BASE_URL ?? "http://127.0.0.1:8010";
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean)
  : undefined;

const nextConfig: NextConfig = {
  typedRoutes: false,
  outputFileTracingRoot: path.join(__dirname, ".."),
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyBaseUrl}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${apiProxyBaseUrl}/health`,
      },
    ];
  },
};

export default nextConfig;
