/** API + uploaded media are proxied to Django so the browser only ever talks to one origin. */
const API_ORIGIN = process.env.API_ORIGIN || "http://127.0.0.1:8010";

export default {
  output: "standalone",
  poweredByHeader: false,
  // Django URLs end in "/" — don't let Next strip it before proxying.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/api/:path*/", destination: `${API_ORIGIN}/api/:path*/` },
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/media/:path*", destination: `${API_ORIGIN}/media/:path*` },
    ];
  },
};
