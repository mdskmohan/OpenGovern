'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const PUBLIC_ROUTES = ['/login'];

function isTokenValid(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Consider expired if less than 60 seconds remaining
    return payload.exp * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (PUBLIC_ROUTES.includes(pathname)) {
      setReady(true);
      return;
    }

    const token = localStorage.getItem('og_access_token');
    if (!token || !isTokenValid(token)) {
      // Preserve the intended destination so login can redirect back
      sessionStorage.setItem('og_redirect_after_login', pathname);
      router.replace('/login');
      return;
    }

    setReady(true);
  }, [pathname, router]);

  // Login page — bare layout, no sidebar
  if (PUBLIC_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  // Waiting for auth check to complete — blank white to avoid flash
  if (!ready) {
    return <div className="min-h-screen bg-white" />;
  }

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
