/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ship the nightly data file with the server routes that read it.
  outputFileTracingIncludes: {
    "/api/nfl": ["./data/nfl.json"],
    "/api/weather": ["./data/nfl.json"],
  },
};
export default nextConfig;
