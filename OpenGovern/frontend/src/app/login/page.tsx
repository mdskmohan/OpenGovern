'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Mail, Lock, AlertCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/auth';

// Demo user object injected directly — no backend call needed
const DEMO_USER = {
  id: 'demo-user',
  email: 'admin@opengovern.io',
  username: 'admin',
  fullName: 'Demo Admin',
  roles: ['admin'],
};

export default function LoginPage() {
  const [email, setEmail] = useState('admin@opengovern.io');
  const [password, setPassword] = useState('admin123');
  const { login, isLoading, error, isAuthenticated, clearError } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      // Redirect to where the user was trying to go, or home
      const dest = sessionStorage.getItem('og_redirect_after_login') || '/';
      sessionStorage.removeItem('og_redirect_after_login');
      router.replace(dest);
    }
  }, [isAuthenticated, router]);

  // Direct demo bypass — writes to localStorage and updates the store,
  // completely bypassing any API call. Works even when backend is offline.
  const handleDemoLogin = () => {
    localStorage.setItem('og_access_token', 'demo-token-no-backend-required');
    localStorage.setItem('og_demo_mode', 'true');
    useAuthStore.setState({
      token: 'demo-token-no-backend-required',
      user: DEMO_USER as any,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    router.push('/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Shortcut for demo credentials
    if (email === 'admin@opengovern.io' && password === 'admin') {
      handleDemoLogin();
      return;
    }
    try {
      await login(email, password);
      router.push('/');
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mb-3">
            <Shield size={20} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">OpenGovern</h1>
          <p className="mt-1 text-sm text-gray-500">Enterprise Data Governance</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-5">Welcome back. Enter your credentials to continue.</p>

          {/* One-click demo button */}
          <button
            onClick={handleDemoLogin}
            className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            <Zap size={14} />
            Enter Demo — no backend needed
          </button>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 bg-white text-xs text-gray-400">or sign in with credentials</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError(); }}
                  placeholder="you@company.com"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="secondary"
              size="md"
              loading={isLoading}
              className="w-full"
            >
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          OpenGovern &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
