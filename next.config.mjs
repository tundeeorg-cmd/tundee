/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  experimental: {
    // Lets instrumentation.ts run at server startup, which is where the LINE
    // environment is validated. Without this the file is ignored silently and
    // a misconfigured deploy boots happily — the failure mode it exists to
    // prevent. Required on Next 14; the hook is on by default from Next 15.
    instrumentationHook: true,
  },
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'egfcqafrlrhkjnynsiyb.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',   // Google OAuth profile photos
      },
    ],
  },
};

export default nextConfig;
