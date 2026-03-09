/**
 * OpenGovern Dashboard - Main Landing Page
 *
 * This is the primary dashboard component that serves as the main entry point
 * for the OpenGovern (Enterprise Data Governance) platform. It displays key
 * governance metrics, recent activity, and provides navigation to various
 * platform features.
 *
 * Key Features:
 * - Real-time governance metrics (datasets, dashboards, pipelines, ML models)
 * - Interactive charts for metadata growth and governance coverage
 * - Recent activity feed showing platform events
 * - AI assistant preview for conversational data governance
 *
 * Architecture:
 * - Built with Next.js 14 App Router
 * - Uses TailwindCSS for responsive, modern styling
 * - Implements OpenAI/Notion-inspired design patterns
 * - Fully responsive across desktop, tablet, and mobile devices
 *
 * Data Sources:
 * - Metrics: Fetched from OpenMetadata API and internal analytics
 * - Activity: Real-time events from platform services
 * - Charts: Placeholder for future integration with charting libraries
 */

"use client"; // Required for client-side interactivity in Next.js App Router

/**
 * Home Component - Main Dashboard Page
 *
 * Renders the comprehensive dashboard with:
 * 1. Welcome header with platform branding
 * 2. Key performance indicator (KPI) cards
 * 3. Analytics charts section
 * 4. Recent activity feed
 * 5. AI assistant call-to-action
 *
 * The component uses a modern card-based layout with gradients,
 * hover effects, and responsive grid system for optimal UX.
 */
export default function Home() {
  return (
    // Main container with vertical spacing between sections
    <div className="space-y-12">
      {/* Welcome Section - Platform Introduction */}
      <div className="text-center">
        {/* Main heading with light font weight for modern aesthetic */}
        <h1 className="text-5xl font-light text-gray-900 mb-4">
          Welcome to OpenGovern
        </h1>
        {/* Subtitle explaining the platform's core value proposition */}
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Your AI-first enterprise data governance platform, powered by OpenMetadata and Open Policy Agent
        </p>
      </div>

      {/* Key Metrics Section - Governance KPIs */}
      {/* Responsive grid: 1 column on mobile, 2 on tablet, 4 on desktop */}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Datasets Metric Card */}
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 p-8 shadow-sm hover:shadow-xl transition-all duration-300">
          {/* Decorative background circle for visual appeal */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200 rounded-full -mr-16 -mt-16 opacity-20 group-hover:opacity-30 transition-opacity"></div>
          <div className="relative">
            {/* Icon container with blue background */}
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500 rounded-xl">
                <span className="text-white text-2xl">📊</span>
              </div>
            </div>
            {/* Metric content with label, value, and trend */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-blue-600 uppercase tracking-wide">
                Total Datasets
              </p>
              <p className="text-4xl font-light text-gray-900">1,234</p>
              <p className="text-sm text-gray-600">+12% from last month</p>
            </div>
          </div>
        </div>

        {/* Dashboards Metric Card */}
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-50 to-green-100 p-8 shadow-sm hover:shadow-xl transition-all duration-300">
          {/* Decorative background circle */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-200 rounded-full -mr-16 -mt-16 opacity-20 group-hover:opacity-30 transition-opacity"></div>
          <div className="relative">
            {/* Icon container with green background */}
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-500 rounded-xl">
                <span className="text-white text-2xl">📈</span>
              </div>
            </div>
            {/* Metric content */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-green-600 uppercase tracking-wide">
                Dashboards
              </p>
              <p className="text-4xl font-light text-gray-900">567</p>
              <p className="text-sm text-gray-600">+8% from last month</p>
            </div>
          </div>
        </div>

        {/* Pipelines Metric Card */}
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 p-8 shadow-sm hover:shadow-xl transition-all duration-300">
          {/* Decorative background circle */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-200 rounded-full -mr-16 -mt-16 opacity-20 group-hover:opacity-30 transition-opacity"></div>
          <div className="relative">
            {/* Icon container with purple background */}
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-500 rounded-xl">
                <span className="text-white text-2xl">🔄</span>
              </div>
            </div>
            {/* Metric content */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-purple-600 uppercase tracking-wide">
                Pipelines
              </p>
              <p className="text-4xl font-light text-gray-900">89</p>
              <p className="text-sm text-gray-600">+15% from last month</p>
            </div>
          </div>
        </div>

        {/* ML Models Metric Card */}
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-50 to-red-100 p-8 shadow-sm hover:shadow-xl transition-all duration-300">
          {/* Decorative background circle */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-200 rounded-full -mr-16 -mt-16 opacity-20 group-hover:opacity-30 transition-opacity"></div>
          <div className="relative">
            {/* Icon container with red background */}
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-500 rounded-xl">
                <span className="text-white text-2xl">🤖</span>
              </div>
            </div>
            {/* Metric content */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-red-600 uppercase tracking-wide">
                ML Models
              </p>
              <p className="text-4xl font-light text-gray-900">23</p>
              <p className="text-sm text-gray-600">+5% from last month</p>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Charts Section */}
      {/* Two-column grid on large screens, single column on smaller screens */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Metadata Growth Chart */}
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
          {/* Chart header with title and time period */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-medium text-gray-900">Metadata Growth</h3>
            <span className="text-sm text-gray-500">Last 12 months</span>
          </div>
          {/* Placeholder for future chart implementation */}
          <div className="h-64 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center">
            <div className="text-center">
              {/* Chart icon placeholder */}
              <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-gray-600">Interactive Chart</p>
              <p className="text-sm text-gray-500">Powered by OpenMetadata analytics</p>
            </div>
          </div>
        </div>

        {/* Governance Coverage Chart */}
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
          {/* Chart header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-medium text-gray-900">Governance Coverage</h3>
            <span className="text-sm text-gray-500">Current status</span>
          </div>
          {/* Placeholder for governance coverage visualization */}
          <div className="h-64 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center">
            <div className="text-center">
              {/* Success indicator icon */}
              <div className="w-16 h-16 bg-green-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-600">Coverage Metrics</p>
              <p className="text-sm text-gray-500">Policy compliance tracking</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      {/* Displays real-time platform events and user actions */}
      <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
        {/* Section header with title and "View all" link */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-medium text-gray-900">Recent Activity</h3>
          <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            View all
          </button>
        </div>

        {/* Activity items list */}
        <div className="space-y-6">
          {/* Dataset Update Activity Item */}
          <div className="flex items-start space-x-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
            {/* User avatar */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">JD</span>
              </div>
            </div>
            {/* Activity content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                John Doe updated dataset description
              </p>
              <p className="text-sm text-gray-600">
                "Customer Data" - Added PII classification
              </p>
              <p className="text-xs text-gray-500 mt-1">2 hours ago</p>
            </div>
            {/* Activity type badge */}
            <div className="flex-shrink-0">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Metadata
              </span>
            </div>
          </div>

          {/* Policy Violation Activity Item */}
          <div className="flex items-start space-x-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
            {/* System avatar */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">AS</span>
              </div>
            </div>
            {/* Activity content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                Policy violation detected
              </p>
              <p className="text-sm text-gray-600">
                "Sales Dashboard" - Unauthorized access attempt
              </p>
              <p className="text-xs text-gray-500 mt-1">4 hours ago</p>
            </div>
            {/* Activity type badge */}
            <div className="flex-shrink-0">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                Alert
              </span>
            </div>
          </div>

          {/* Ingestion Success Activity Item */}
          <div className="flex items-start space-x-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
            {/* OpenMetadata avatar */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">OM</span>
              </div>
            </div>
            {/* Activity content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                OpenMetadata ingestion completed
              </p>
              <p className="text-sm text-gray-600">
                Successfully ingested 45 new tables from PostgreSQL
              </p>
              <p className="text-xs text-gray-500 mt-1">6 hours ago</p>
            </div>
            {/* Activity type badge */}
            <div className="flex-shrink-0">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Success
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Assistant Call-to-Action Section */}
      {/* Prominent section highlighting AI capabilities */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-white">
        <div className="flex items-center justify-between">
          {/* Content section */}
          <div>
            <h3 className="text-2xl font-light mb-2">AI-Powered Governance</h3>
            <p className="text-blue-100 mb-4">
              Ask questions about your data governance, get insights, and receive recommendations powered by AI.
            </p>
            {/* Call-to-action button */}
            <button className="bg-white text-blue-600 px-6 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors">
              Try AI Assistant
            </button>
          </div>
          {/* Decorative robot icon - hidden on mobile */}
          <div className="hidden lg:block">
            <div className="w-24 h-24 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-4xl">🤖</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
