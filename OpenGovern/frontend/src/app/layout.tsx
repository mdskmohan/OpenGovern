/**
 * OpenGovern Root Layout Component
 *
 * This is the main layout component for the OpenGovern application, built with Next.js 14 App Router.
 * It provides the overall structure and navigation framework for the entire platform.
 *
 * Key Responsibilities:
 * - Define global HTML structure and metadata
 * - Configure typography and global styles
 * - Implement responsive sidebar navigation
 * - Provide consistent layout across all pages
 * - Handle global state and context providers
 *
 * Architecture:
 * - Uses Next.js App Router for file-based routing
 * - Implements a sidebar + main content layout pattern
 * - Responsive design that adapts to different screen sizes
 * - Modern font stack with Geist Sans and Geist Mono
 * - Clean separation of navigation, header, and content areas
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

/**
 * Geist Sans Font Configuration
 *
 * Modern, highly readable sans-serif font optimized for UI text.
 * Used for body text, headings, and interface elements.
 *
 * Features:
 * - Variable font with multiple weights
 * - Excellent readability at small sizes
 * - Clean, modern aesthetic
 * - Optimized for web performance
 */
const geistSans = Geist({
  variable: "--font-geist-sans", // CSS custom property for font-family
  subsets: ["latin"], // Only load Latin character set for performance
});

/**
 * Geist Mono Font Configuration
 *
 * Monospace font for code snippets, terminal output, and technical content.
 * Provides consistent character spacing for code readability.
 *
 * Features:
 * - Fixed-width characters
 * - Excellent for code display
 * - Matches Geist Sans design language
 * - Optimized for developer tools and documentation
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono", // CSS custom property for monospace font
  subsets: ["latin"], // Latin character subset only
});

/**
 * Application Metadata Configuration
 *
 * Defines SEO metadata, browser tab information, and social media previews.
 * This metadata is automatically injected into the HTML <head> by Next.js.
 */
export const metadata: Metadata = {
  title: "OpenGovern", // Browser tab title
  description: "Modern Enterprise Data Governance Platform", // Meta description for SEO
};

/**
 * Root Layout Component
 *
 * The top-level layout that wraps all pages in the application.
 * Provides consistent structure, navigation, and global styling.
 *
 * Props:
 * - children: React.ReactNode - The page content to render
 *
 * Layout Structure:
 * - HTML document with proper lang attribute
 * - Body with font variables and background color
 * - Flex container for sidebar + main content
 * - Sidebar navigation component
 * - Top bar with user actions and search
 * - Main content area with scrollable overflow
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // HTML document root with language specification
    <html lang="en">
      {/* Body element with font variables and global styling */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        {/* Main application container - full height flex layout */}
        <div className="flex h-screen">
          {/* Sidebar Navigation - Fixed width, always visible */}
          <Sidebar />

          {/* Main content area - flexible width, takes remaining space */}
          <div className="flex flex-1 flex-col">
            {/* Top navigation bar - fixed height */}
            <TopBar />

            {/* Main content area - scrollable, padded */}
            <main className="flex-1 overflow-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
