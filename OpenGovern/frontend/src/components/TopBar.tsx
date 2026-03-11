'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, ChevronDown, User, Settings, LogOut } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { SearchBar } from './ui/SearchBar';
import { useAuthStore } from '@/lib/auth';
import { useAlerts } from '@/hooks/useAlerts';
import { cn } from './ui/cn';

const pageLabels: Record<string, string> = {
  '/': 'Dashboard',
  '/catalog': 'Catalog',
  '/lineage': 'Lineage',
  '/policies': 'Policies',
  '/workflows': 'Workflows',
  '/classifications': 'Classifications',
  '/data-quality': 'Data Quality',
  '/alerts': 'Alerts',
  '/integrations': 'Integrations',
  '/metrics': 'Metrics',
  '/users': 'Users',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  if (pathname in pageLabels) return pageLabels[pathname];
  for (const [key, label] of Object.entries(pageLabels)) {
    if (pathname.startsWith(key + '/')) return label;
  }
  return 'OpenGovern';
}

export function TopBar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { data: alertsData } = useAlerts({ status: 'open' });
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = alertsData?.data?.slice(0, 5).length || 0;
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-6 z-30">
      {/* Page title */}
      <h1 className="text-sm font-semibold text-gray-900 w-40 shrink-0">{pageTitle}</h1>

      {/* Search - center */}
      <div className="flex-1 flex justify-center">
        <SearchBar />
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-3 w-40 justify-end">
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Alerts</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {alertsData?.data?.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50"
                  >
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {alert.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {alert.message}
                    </p>
                  </div>
                ))}
                {!alertsData?.data?.length && (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">
                    No open alerts
                  </div>
                )}
              </div>
              <div className="px-4 py-2 border-t border-gray-100">
                <a href="/alerts" className="text-xs text-blue-600 hover:underline">
                  View all alerts
                </a>
              </div>
            </div>
          )}
        </div>

        {/* User dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors',
            )}>
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold uppercase shrink-0">
                {user ? (user.fullName || user.username || user.email).charAt(0) : 'U'}
              </div>
              <ChevronDown size={12} className="text-gray-400" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 mt-1"
            >
              {user && (
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {user.fullName || user.username}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
                </div>
              )}
              <DropdownMenu.Item asChild>
                <a
                  href="/settings"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer outline-none"
                >
                  <User size={13} className="text-gray-400" />
                  Profile
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <a
                  href="/settings"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer outline-none"
                >
                  <Settings size={13} className="text-gray-400" />
                  Settings
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 border-t border-gray-100" />
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer outline-none"
                onSelect={logout}
              >
                <LogOut size={13} />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
