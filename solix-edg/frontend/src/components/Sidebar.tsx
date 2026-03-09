/**
 * OpenGovern Sidebar Navigation Component
 *
 * Main navigation component that provides access to all major sections of the platform.
 * Implements a dark-themed sidebar with icons and labels for each navigation item.
 *
 * Key Features:
 * - Active route highlighting based on current pathname
 * - Responsive hover effects and visual feedback
 * - Comprehensive navigation covering all platform features
 * - Clean, modern design with consistent spacing
 *
 * Navigation Structure:
 * - Core Features: Home, Catalog, Lineage, Data Quality
 * - Governance: Policies, Classifications, Metrics
 * - Operations: Alerts, Workflows, Integrations
 * - Administration: Users & Roles, Documentation, Settings
 *
 * Technical Implementation:
 * - Uses Next.js Link for client-side navigation
 * - usePathname hook for active route detection
 * - TailwindCSS for styling and responsive design
 * - Emoji icons for visual clarity and modern aesthetic
 */

"use client"; // Required for Next.js client-side hooks (usePathname)

/**
 * Navigation Configuration Array
 *
 * Defines all navigation items with their properties:
 * - name: Display name in the sidebar
 * - href: Route path for navigation
 * - icon: Emoji icon for visual identification
 *
 * Organized by functional areas for logical grouping and user experience.
 */
const navigation = [
  // Core Platform Features
  { name: 'Home', href: '/', icon: '🏠' }, // Dashboard and overview
  { name: 'Catalog', href: '/catalog', icon: '📚' }, // Metadata catalog browser
  { name: 'Lineage', href: '/lineage', icon: '🔗' }, // Data lineage visualization
  { name: 'Data Quality', href: '/data-quality', icon: '✅' }, // Quality monitoring dashboard

  // Governance & Policies
  { name: 'Policies', href: '/policies', icon: '📋' }, // Policy management interface
  { name: 'Classifications', href: '/classifications', icon: '🏷️' }, // Data classification tags

  // Analytics & Monitoring
  { name: 'Metrics', href: '/metrics', icon: '📊' }, // Platform metrics and KPIs

  // Operations & Alerts
  { name: 'Alerts', href: '/alerts', icon: '🚨' }, // System alerts and notifications
  { name: 'Workflows', href: '/workflows', icon: '⚙️' }, // Governance workflow management

  // Integrations & Connectivity
  { name: 'Integrations', href: '/integrations', icon: '🔌' }, // Data source integrations

  // User Management & Administration
  { name: 'Users & Roles', href: '/users', icon: '👥' }, // User and role management

  // Documentation & Help
  { name: 'Documentation', href: '/docs', icon: '📖' }, // Platform documentation

  // System Configuration
  { name: 'Settings', href: '/settings', icon: '⚙️' }, // Platform settings and configuration
];

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sidebar Component
 *
 * Renders the main navigation sidebar with:
 * - Platform branding header
 * - Navigation menu with active state highlighting
 * - Responsive design for different screen sizes
 * - Consistent styling with the overall application theme
 *
 * State Management:
 * - Uses usePathname() to determine active navigation item
 * - No internal state - purely presentational component
 *
 * Accessibility:
 * - Semantic navigation structure
 * - Clear visual indicators for active states
 * - Keyboard navigation support through Next.js Link
 */
export default function Sidebar() {
  // Get current pathname for active route highlighting
  const pathname = usePathname();

  return (
    // Main sidebar container - fixed width, full height, dark theme
    <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
      {/* Header section with platform branding */}
      <div className="flex h-16 items-center px-4">
        <h1 className="text-xl font-bold">OpenGovern</h1>
      </div>

      {/* Navigation menu - scrollable area with navigation items */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {/* Map through navigation items to create menu links */}
        {navigation.map((item) => (
          <Link
            key={item.name} // Unique key for React rendering
            href={item.href} // Navigation destination
            className={`group flex items-center rounded-md px-2 py-2 text-sm font-medium ${
              // Conditional styling based on active route
              pathname === item.href
                ? 'bg-gray-800 text-white' // Active state: darker background
                : 'text-gray-300 hover:bg-gray-700 hover:text-white' // Inactive: lighter with hover
            }`}
          >
            {/* Navigation icon with consistent spacing */}
            <span className="mr-3">{item.icon}</span>
            {/* Navigation label */}
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}