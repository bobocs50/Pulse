import type { NextConfig } from "next";

// HTTPS dev: run `npx next dev --experimental-https` — it generates and uses
// certs in ./certificates automatically. (httpsKeyFile/httpsCertFile are not
// valid Next config options and broke the build.)
const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com", "10.6.67.108", "10.6.67.129"],
};

export default nextConfig;
