/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@supabase/ssr'],
  // Enable compression
  compress: true,
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;

