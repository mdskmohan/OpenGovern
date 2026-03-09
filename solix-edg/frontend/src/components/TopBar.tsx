"use client";

import { useState } from 'react';

export default function TopBar() {
  const [query, setQuery] = useState('');

  return (
    <div className="flex h-16 items-center justify-between bg-white px-4 shadow">
      <div className="flex-1 max-w-md">
        <div className="relative">
          <input
            type="text"
            placeholder="Search metadata, assets, policies..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-2 pl-10 focus:border-blue-500 focus:outline-none"
          />
          <div className="absolute inset-y-0 left-0 flex items-center pl-3">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <button className="rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          AI Assistant
        </button>
        <div className="h-8 w-8 rounded-full bg-gray-300"></div>
      </div>
    </div>
  );
}