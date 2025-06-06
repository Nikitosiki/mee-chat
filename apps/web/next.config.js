/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["db", "server", "shared", "ui"],
  experimental: {
    serverComponentsExternalPackages: ["@inworld/nodejs-sdk", "ably"],
  },
  images: {
    remotePatterns: [
      {
        hostname: "res.cloudinary.com",
        protocol: "https",
      },
      {
        hostname: "cdn.discordapp.com",
        protocol: "https",
      },
    ],
    deviceSizes: [350, 500, 640, 828, 1080, 1200, 1920, 2048, 3840],
  },
  async redirects() {
    return [{ source: "/home", destination: "/", permanent: false }];
  },
  output: "standalone",
};

module.exports = nextConfig;
