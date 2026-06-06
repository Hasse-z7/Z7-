import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: [
    '@supabase/supabase-js',
    '@supabase/postgrest-js',
    '@supabase/realtime-js',
    '@supabase/storage-js',
    '@supabase/auth-js',
    '@supabase/functions-js',
    'coze-coding-dev-sdk',
    'dotenv',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark packages as external to prevent rslib runtime bundling issues
      // ("Q.add is not a function"). Both @supabase/supabase-js and coze-coding-dev-sdk
      // use rslib's module system, and when webpack bundles them together, their
      // rslib runtimes conflict. Loading them from node_modules at runtime fixes this.
      const externals = [
        '@supabase/supabase-js',
        '@supabase/postgrest-js',
        '@supabase/realtime-js',
        '@supabase/storage-js',
        '@supabase/auth-js',
        '@supabase/functions-js',
        'coze-coding-dev-sdk',
        'dotenv',
      ];
      if (!config.externals) {
        config.externals = [];
      }
      if (Array.isArray(config.externals)) {
        config.externals.push(...externals);
      }
    }
    return config;
  },
};

export default nextConfig;
