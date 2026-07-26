/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        // Proxy AI-service calls through Next.js in dev so the browser
        // only ever talks to one origin. In prod (Vercel) set AI_SERVICE_URL
        // to the deployed FastAPI endpoint (e.g. on Render/Fly.io).
        source: "/ai/:path*",
        destination: `${process.env.AI_SERVICE_URL || "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
