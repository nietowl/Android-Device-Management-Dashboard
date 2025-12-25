/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@supabase/ssr'],
  // Enable compression
  compress: true,
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Production optimizations - disable source maps
  productionBrowserSourceMaps: false,
  // SWC minification options (Next.js uses SWC by default)
  swcMinify: true,
  // Compiler options for removing console statements
  // Remove all console logs in all environments (development and production)
  compiler: {
    removeConsole: true, // Remove all console.log, console.warn, console.info, console.debug, console.error
  },
  // Webpack configuration for additional obfuscation
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

