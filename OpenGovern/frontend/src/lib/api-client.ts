/**
 * API Client for OpenGovern services.
 *
 * Each service has its own typed client.
 * Auth token is automatically attached to all requests.
 * On 401: redirect to login page.
 */

import axios, { AxiosInstance } from 'axios';
import type {
  AssetListParams,
  PolicyListParams,
  SearchParams,
  RegisterData,
} from '@/types';

function createClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 10000 });

  // Attach auth token
  client.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('og_access_token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Handle 401 — silently reject so pages show empty states instead of redirecting.
  // Auth enforcement is handled by the AppShell, not here.
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      return Promise.reject(error);
    }
  );

  return client;
}

const catalogClient = createClient(
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
);
const authClient = createClient(
  process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3010'
);
const aiClient = createClient(
  process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:3006'
);

// Typed API methods
export const api = {
  auth: {
    login: (email: string, password: string) =>
      authClient.post('/api/v1/auth/login', { email, password }),
    logout: () => authClient.post('/api/v1/auth/logout'),
    me: () => authClient.get('/api/v1/auth/me'),
    register: (data: RegisterData) =>
      authClient.post('/api/v1/auth/register', data),
  },
  assets: {
    list: (params?: AssetListParams) =>
      catalogClient.get('/api/v1/assets', { params }),
    get: (urn: string) =>
      catalogClient.get(`/api/v1/assets/${encodeURIComponent(urn)}`),
    stats: () => catalogClient.get('/api/v1/assets/stats'),
    updateAspect: (urn: string, aspectType: string, payload: unknown) =>
      catalogClient.put(
        `/api/v1/assets/${encodeURIComponent(urn)}/aspects/${aspectType}`,
        payload
      ),
  },
  lineage: {
    getGraph: (urn: string, depth = 3, direction = 'both') =>
      catalogClient.get(
        `/api/v1/assets/${encodeURIComponent(urn)}/lineage`,
        { params: { depth, direction } }
      ),
    getImpact: (urn: string) =>
      catalogClient.get(`/api/v1/assets/${encodeURIComponent(urn)}/impact`),
  },
  search: {
    query: (params: SearchParams) =>
      catalogClient.get('/api/v1/search', { params }),
  },
  domains: {
    list: () => catalogClient.get('/api/v1/domains'),
    get: (id: string) => catalogClient.get(`/api/v1/domains/${id}`),
  },
  tags: {
    list: () => catalogClient.get('/api/v1/tags'),
  },
  policies: {
    list: (params?: PolicyListParams) =>
      catalogClient.get('/api/v1/policies', { params }),
    get: (id: string) => catalogClient.get(`/api/v1/policies/${id}`),
    create: (data: unknown) => catalogClient.post('/api/v1/policies', data),
    update: (id: string, data: unknown) =>
      catalogClient.put(`/api/v1/policies/${id}`, data),
    activate: (id: string) =>
      catalogClient.post(`/api/v1/policies/${id}/activate`),
    deactivate: (id: string) =>
      catalogClient.post(`/api/v1/policies/${id}/deactivate`),
    evaluate: (data: unknown) =>
      catalogClient.post('/api/v1/policies/evaluate', data),
  },
  quality: {
    rules: {
      list: (params?: Record<string, unknown>) =>
        catalogClient.get('/api/v1/quality/rules', { params }),
      create: (data: unknown) =>
        catalogClient.post('/api/v1/quality/rules', data),
    },
    scores: {
      latest: (assetUrn: string) =>
        catalogClient.get(
          `/api/v1/quality/scores/${encodeURIComponent(assetUrn)}/latest`
        ),
      history: (assetUrn: string) =>
        catalogClient.get(
          `/api/v1/quality/scores/${encodeURIComponent(assetUrn)}/history`
        ),
      dashboard: () => catalogClient.get('/api/v1/quality/dashboard'),
      triggerRun: (assetUrn: string) =>
        catalogClient.post(
          `/api/v1/quality/scores/${encodeURIComponent(assetUrn)}/run`
        ),
    },
  },
  alerts: {
    list: (params?: Record<string, unknown>) =>
      catalogClient.get('/api/v1/alerts', { params }),
    acknowledge: (id: string) =>
      catalogClient.post(`/api/v1/alerts/${id}/acknowledge`),
    resolve: (id: string, note?: string) =>
      catalogClient.post(`/api/v1/alerts/${id}/resolve`, { note }),
  },
  sources: {
    list: () => catalogClient.get('/api/v1/sources'),
    get: (id: string) => catalogClient.get(`/api/v1/sources/${id}`),
    create: (data: unknown) => catalogClient.post('/api/v1/sources', data),
    update: (id: string, data: unknown) => catalogClient.put(`/api/v1/sources/${id}`, data),
    delete: (id: string) => catalogClient.delete(`/api/v1/sources/${id}`),
    triggerRun: (id: string) => catalogClient.post(`/api/v1/sources/${id}/trigger`),
    getRuns: (id: string) => catalogClient.get(`/api/v1/sources/${id}/runs`),
    // testConnection: dry-run validation before committing credentials.
    // Returns { latency_ms, metadata } on success or throws with error detail.
    testConnection: (data: unknown) =>
      catalogClient.post('/api/v1/sources/test-connection', data),
  },
  workflows: {
    listInstances: (params?: Record<string, unknown>) =>
      catalogClient.get('/api/v1/workflows/instances', { params }),
    listDefinitions: () => catalogClient.get('/api/v1/workflows/definitions'),
    getInstance: (id: string) =>
      catalogClient.get(`/api/v1/workflows/instances/${id}`),
    initiate: (data: unknown) =>
      catalogClient.post('/api/v1/workflows/instances', data),
    approve: (id: string, comment?: string) =>
      catalogClient.post(`/api/v1/workflows/instances/${id}/approve`, { comment }),
    reject: (id: string, comment: string) =>
      catalogClient.post(`/api/v1/workflows/instances/${id}/reject`, { comment }),
    comment: (id: string, content: string) =>
      catalogClient.post(`/api/v1/workflows/instances/${id}/comment`, { content }),
    reassign: (id: string, userId: string) =>
      catalogClient.post(`/api/v1/workflows/instances/${id}/reassign`, { userId }),
  },
  ai: {
    search: (query: string, limit = 10) =>
      aiClient.post('/search', { query, limit }),
    classify: (assetUrn: string, schema: unknown) =>
      aiClient.post('/classify/asset', { asset_urn: assetUrn, schema }),
  },
};

export type { RegisterData, AssetListParams, SearchParams, PolicyListParams };
