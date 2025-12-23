/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@supabase/ssr'],
  // Enable compression
  compress: true,
  // Environment variables validation
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Production optimizations - disable source maps
  productionBrowserSourceMaps: false,
  // Compiler options for removing console statements
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? true : false,
  },
  // Use webpack explicitly (Next.js 16 defaults to Turbopack)
  // Add empty turbopack config to silence warning when using webpack
  turbopack: {},
  webpack: (config, { dev, isServer }) => {
    // Production-only optimizations for client-side code
    if (!dev && !isServer) {
      // Ensure minification is enabled
      config.optimization = {
        ...config.optimization,
        minimize: true,
      };
    }
    
    return config;
  },
};

export default nextConfig;

