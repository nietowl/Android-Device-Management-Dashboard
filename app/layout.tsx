import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/theme/ThemeProvider";

const inter = Inter({ 
  subsets: ["latin"],
  display: "swap",
  preload: true,
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Android Device Management Dashboard",
  description: "Remote management and control for Android devices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get base URL from environment variable, fallback to relative path
  // This ensures all relative URLs resolve correctly and prevents port 8080 issues
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  // Ensure base URL has trailing slash (HTML spec requirement)
  const baseHref = baseUrl ? (baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`) : '';
  
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Base tag ensures all relative URLs resolve correctly */}
        {baseHref && <base href={baseHref} />}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Ensure console.warn exists (polyfill for environments where it might be missing)
              if (typeof console !== 'undefined') {
                if (typeof console.warn !== 'function') {
                  console.warn = function() {
                    if (typeof console.log === 'function') {
                      console.log.apply(console, arguments);
                    }
                  };
                }
                if (typeof console.error !== 'function') {
                  console.error = function() {
                    if (typeof console.log === 'function') {
                      console.log.apply(console, arguments);
                    }
                  };
                }
              }
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

