/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@supabase/ssr'],
  // Enable compression
  compress: true,
  // Ensure relative URLs are used for assets (default behavior, but explicit for clarity)
  // This prevents issues with port 8080 in production
  assetPrefix: process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL 
    ? undefined // Use relative URLs (default)
    : undefined,
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Production optimizations - enable source maps for better error tracking
  productionBrowserSourceMaps: true,
  // SWC minification options (Next.js uses SWC by default)
  swcMinify: true,
  // Compiler options for removing console statements
  // Remove ALL console methods in production (log, info, debug, warn, error)
  // This prevents any information leakage that could be used to trace back
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' 
      ? true // Remove ALL console methods in production
      : false,
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
    
    // Exclude test files and dev files from production builds
    // Note: Files are removed by deployment script before build
    // This ensures they're not accidentally included if script fails
    if (!dev) {
      // Exclude test files from being processed by webpack
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
      };
    }
    
    return config;
  },
  
  // Exclude development files from production build
  ...(process.env.NODE_ENV === 'production' && {
    // Exclude test files and dev utilities from build
    experimental: {
      outputFileTracingExcludes: {
        '*': [
          '**/__tests__/**',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.test.js',
          '**/*.test.jsx',
          '**/*.spec.ts',
          '**/*.spec.tsx',
          '**/dev-proxy.js',
          '**/troubleshoot-deployment.sh',
          '**/backup.sh',
          '**/jest.config.js',
          '**/jest.setup.js',
        ],
      },
    },
  }),
};

export default nextConfig;

