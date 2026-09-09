import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Unser Server- und Package-Code nutzt explizite ".js"-Endungen in relativen
  // Imports (Node-ESM-Konvention, noetig fuer tsx/Node im Custom-Server).
  // Webpack muss diese Endungen auf die tatsaechlichen .ts-Dateien mappen.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
