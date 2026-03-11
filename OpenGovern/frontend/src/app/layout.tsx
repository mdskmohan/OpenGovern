import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ReactQueryProvider } from '@/lib/query-client';
import { AppShell } from '@/components/AppShell';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OpenGovern — Enterprise Data Governance',
  description: 'AI-first enterprise data governance platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-[#f9fafb] text-gray-900">
        <ReactQueryProvider>
          <AppShell>{children}</AppShell>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
