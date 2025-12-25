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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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

