'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

// Demo mode: auth gate removed so the full UI is accessible immediately.
// When running with the real backend, restore auth checks here.

const LOGIN_ROUTE = '/login';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login page: render without sidebar/topbar
  if (pathname === LOGIN_ROUTE) {
    return <>{children}</>;
  }

  // All other pages: show full authenticated layout directly
  return (
    <div className="flex h-screen overflow-hidden bg-[#f9fafb]">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-60 min-h-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto pt-14">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
