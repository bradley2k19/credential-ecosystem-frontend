import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    if (!apiUrl) return [];
    return [
      {
        // Certificate images are served from this site's own origin, proxied to the backend's asset route, so
        // the certificate preview and the PDF capture never make cross-origin image requests. Only a UUID
        // matches; any other path falls through to the normal 404.
        source: `/asset-proxy/:id(${UUID})`,
        destination: `${apiUrl}/api/assets/:id`,
      },
    ];
  },
};

export default nextConfig;
