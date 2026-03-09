"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Home', href: '/', icon: '🏠' },
  { name: 'Catalog', href: '/catalog', icon: '📚' },
  { name: 'Lineage', href: '/lineage', icon: '🔗' },
  { name: 'Data Quality', href: '/data-quality', icon: '✅' },
  { name: 'Policies', href: '/policies', icon: '📋' },
  { name: 'Classifications', href: '/classifications', icon: '🏷️' },
  { name: 'Metrics', href: '/metrics', icon: '📊' },
  { name: 'Alerts', href: '/alerts', icon: '🚨' },
  { name: 'Workflows', href: '/workflows', icon: '⚙️' },
  { name: 'Integrations', href: '/integrations', icon: '🔌' },
  { name: 'Users & Roles', href: '/users', icon: '👥' },
  { name: 'Documentation', href: '/docs', icon: '📖' },
  { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
      <div className="flex h-16 items-center px-4">
        <h1 className="text-xl font-bold">Solix EDG</h1>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={`group flex items-center rounded-md px-2 py-2 text-sm font-medium ${
              pathname === item.href
                ? 'bg-gray-800 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <span className="mr-3">{item.icon}</span>
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}