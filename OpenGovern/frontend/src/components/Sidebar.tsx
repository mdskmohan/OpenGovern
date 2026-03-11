'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Database,
  GitBranch,
  Shield,
  GitPullRequest,
  Tag,
  CheckCircle2,
  Bell,
  BarChart3,
  Users,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from './ui/cn';
import { useAuthStore } from '@/lib/auth';

const navigation = [
  {
    group: 'DISCOVER',
    items: [
      { name: 'Catalog', href: '/catalog', icon: Database },
      { name: 'Lineage', href: '/lineage', icon: GitBranch },
    ],
  },
  {
    group: 'GOVERN',
    items: [
      { name: 'Policies', href: '/policies', icon: Shield },
      { name: 'Workflows', href: '/workflows', icon: GitPullRequest },
      { name: 'Classifications', href: '/classifications', icon: Tag },
    ],
  },
  {
    group: 'QUALITY',
    items: [
      { name: 'Data Quality', href: '/data-quality', icon: CheckCircle2 },
      { name: 'Alerts', href: '/alerts', icon: Bell },
    ],
  },
  {
    group: 'CONNECT',
    items: [
      { name: 'Metrics', href: '/metrics', icon: BarChart3 },
    ],
  },
  {
    group: 'ADMIN',
    items: [
      { name: 'Users', href: '/users', icon: Users },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href + '/'));

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#f3f4f6] border-r border-gray-200 flex flex-col z-40">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-200">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
            <Shield size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900">OpenGovern</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navigation.map((section) => (
          <div key={section.group} className="mb-5">
            <p className="px-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              {section.group}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors duration-100 relative',
                      active
                        ? 'bg-white text-blue-600 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                        : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-600 rounded-r-full" />
                    )}
                    <item.icon
                      size={15}
                      className={cn(
                        'shrink-0 transition-colors',
                        active ? 'text-blue-600' : 'text-gray-400'
                      )}
                    />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-200 p-3">
        {user ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0 uppercase">
              {(user.fullName || user.username || user.email).charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">
                {user.fullName || user.username}
              </p>
              <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 bg-gray-200 rounded animate-pulse" />
              <div className="h-2 bg-gray-200 rounded w-3/4 animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
