import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com", "10.6.67.108", "10.6.67.129"],
  experimental: {
    httpsKeyFile: "./localhost-key.pem",
    httpsCertFile: "./localhost.pem",
  },
};

export default nextConfig;
