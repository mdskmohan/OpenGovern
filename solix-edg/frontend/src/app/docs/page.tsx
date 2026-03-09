"use client";

import { useState } from 'react';

export default function Docs() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m your OpenGovern documentation assistant. How can I help you today?' }
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: query }]);
    // Mock AI response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Regarding "${query}": This is powered by OpenMetadata's comprehensive documentation. You can find detailed guides on data governance, metadata management, and integration setup in our knowledge base.`
      }]);
    }, 1000);
    setQuery('');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-light text-gray-900">Documentation</h1>
        <p className="mt-2 text-lg text-gray-600">Learn about OpenGovern and OpenMetadata</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-medium text-gray-900 mb-4">Getting Started</h2>
            <div className="space-y-4">
              <div className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-medium text-gray-900">Platform Overview</h3>
                <p className="text-gray-600">Introduction to OpenGovern's AI-first approach to data governance</p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-medium text-gray-900">OpenMetadata Integration</h3>
                <p className="text-gray-600">How OpenGovern leverages OpenMetadata's metadata engine</p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h3 className="font-medium text-gray-900">Policy Engine</h3>
                <p className="text-gray-600">Using Open Policy Agent for automated governance</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-medium text-gray-900 mb-4">API Reference</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Metadata Service</h4>
                <p className="text-sm text-gray-600">REST APIs for asset management and lineage</p>
                <code className="text-xs bg-gray-200 px-2 py-1 rounded mt-2 block">GET /api/catalog/assets</code>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Policy Service</h4>
                <p className="text-sm text-gray-600">Policy evaluation and management</p>
                <code className="text-xs bg-gray-200 px-2 py-1 rounded mt-2 block">POST /api/policies/evaluate</code>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-medium text-gray-900 mb-4">AI Assistant</h3>
            <div className="h-96 flex flex-col">
              <div className="flex-1 space-y-4 mb-4 overflow-y-auto">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs px-4 py-2 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-black text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSubmit} className="flex space-x-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask about OpenGovern..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Ask
                </button>
              </form>
            </div>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">OpenMetadata Docs</h3>
            <p className="text-gray-600 text-sm mb-4">
              Access the full OpenMetadata documentation for advanced features.
            </p>
            <button className="w-full bg-white text-gray-900 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              View OpenMetadata Docs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}