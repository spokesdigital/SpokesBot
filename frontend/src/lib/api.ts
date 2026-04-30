import type {
  Dataset,
  HelpArticle,
  OrgMember,
  Thread,
  Message,
  AnalyticsRequest,
  AnalyticsResult,
  InsightsRequest,
  InsightsResult,
  UserProfile,
  Organization,
} from '@/types'
import { createClient } from '@/lib/supabase'

const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL
// Catch misconfigured Vercel/Render deployments early:
// If this env var is missing in production you'll silently call localhost:8000 from the browser,
// which will fail with a CORS/network error. Emit a loud console warning.
if (!_rawApiUrl && typeof window !== 'undefined') {
  console.warn(
    '[SpokesBot] NEXT_PUBLIC_API_URL is not set. ' +
      'All API calls will fall back to http://localhost:8000, ' +
      'which will fail in production. ' +
      'Set this variable in your Vercel / Render environment settings.',
  )
}
const API_URL = (_rawApiUrl ?? 'http://localhost:8000').replace(/\/+$/, '')
const DEFAULT_API_TIMEOUT_MS = 15_000

// In-memory cache for idempotent requests to prevent redundant loading states
const apiCache = new Map<string, { data: unknown; expiresAt: number }>()

/**
 * Clear the entire API cache. Use this after a new dataset is uploaded
 * or when switching organizations to ensure data freshness.
 */
export function invalidateApiCache() {
  apiCache.clear()
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function formatApiErrorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          const location = Array.isArray(record.loc)
            ? record.loc.filter((part) => part !== 'body').join('.')
            : ''
          const message = typeof record.msg === 'string' ? record.msg : JSON.stringify(record)
          const input = record.input != null ? ` Received: ${String(record.input)}.` : ''
          return location ? `${location}: ${message}.${input}` : `${message}.${input}`
        }
        return String(item)
      })
      .filter(Boolean)
    return messages.join(' ')
  }
  if (detail && typeof detail === 'object') {
    const record = detail as Record<string, unknown>
    if (typeof record.message === 'string') return record.message
    if (typeof record.msg === 'string') return record.msg
    if (typeof record.error === 'string') return record.error
    try {
      return JSON.stringify(detail)
    } catch {
      return 'Request failed'
    }
  }
  return 'Request failed'
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string; timeoutMs?: number; cacheMs?: number } = {},
): Promise<T> {
  const {
    token,
    headers: extraHeaders,
    signal: externalSignal,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    cacheMs,
    ...fetchOptions
  } = options

  const method = fetchOptions.method || 'GET'
  let cacheKey: string | null = null

  if (cacheMs && (method === 'GET' || method === 'POST')) {
    // Token is intentionally excluded from the key: the cache lives in one browser
    // tab for one user session, so including it just bloats the key with a JWT.
    cacheKey = `${method}:${path}:${fetchOptions.body ? String(fetchOptions.body) : ''}`
    const cached = apiCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason)
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'AbortError'))
  }, timeoutMs)

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason)
    } else {
      externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true })
    }
  }

  try {
    let res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers, signal: controller.signal })

    // C2: 401 auto-refresh — try to get a fresh token and retry once
    if (res.status === 401 && token) {
      const supabase = createClient()
      const { data } = await supabase.auth.refreshSession()
      if (data.session) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`
        res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers, signal: controller.signal })
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new ApiError(res.status, formatApiErrorDetail(body.detail ?? body))
    }

    // 204 No Content
    if (res.status === 204) return undefined as T

    const data = (await res.json()) as T

    if (cacheKey && cacheMs) {
      // Evict the oldest entry when the cache grows too large to prevent memory bloat.
      if (apiCache.size >= 500) {
        const firstKey = apiCache.keys().next().value
        if (firstKey !== undefined) apiCache.delete(firstKey)
      }
      apiCache.set(cacheKey, { data, expiresAt: Date.now() + cacheMs })
    }

    return data
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromExternalSignal)
  }
}

function withQuery(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export const api = {
  auth: {
    me: (token: string) =>
      apiFetch<UserProfile>('/auth/me', { token, timeoutMs: 60_000 }),
  },

  organizations: {
    list: (token: string) =>
      apiFetch<Organization[]>('/organizations/', { token, timeoutMs: 10_000 }),

    create: (body: { name: string }, token: string) =>
      apiFetch<Organization>('/organizations/', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
        timeoutMs: 10_000,
      }),

    update: (id: string, body: { name: string }, token: string) =>
      apiFetch<Organization>(`/organizations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        token,
        timeoutMs: 10_000,
      }),

    delete: (id: string, token: string) =>
      apiFetch<void>(`/organizations/${id}`, { method: 'DELETE', token, timeoutMs: 10_000 }),

    members: {
      list: (orgId: string, token: string) =>
        apiFetch<OrgMember[]>(`/organizations/${orgId}/members`, { token, timeoutMs: 10_000 }),

      invite: (orgId: string, body: { email: string; role: string }, token: string) =>
        apiFetch<OrgMember>(`/organizations/${orgId}/members`, {
          method: 'POST',
          body: JSON.stringify(body),
          token,
          timeoutMs: 20_000,
        }),

      remove: (orgId: string, userId: string, token: string) =>
        apiFetch<void>(`/organizations/${orgId}/members/${userId}`, {
          method: 'DELETE',
          token,
          timeoutMs: 10_000,
        }),
    },
  },

  datasets: {
    list: (token: string, orgId?: string, allOrgs?: boolean, reportType?: string) =>
      apiFetch<{ datasets: Dataset[] }>(
        withQuery('/datasets/', { org_id: orgId, all_orgs: allOrgs ? 'true' : undefined, report_type: reportType }),
        { token, timeoutMs: 10_000, cacheMs: 60_000 },
      ).then(r => r.datasets),

    get: (id: string, token: string) =>
      apiFetch<Dataset>(`/datasets/${id}`, { token, timeoutMs: 10_000 }),

    delete: (id: string, token: string) =>
      apiFetch<void>(`/datasets/${id}`, { method: 'DELETE', token, timeoutMs: 10_000 }),

    upload: (
      file: File,
      orgId: string,
      token: string,
      reportName?: string,
      reportType?: string,
    ): Promise<{ dataset_id: string }> => {
      const form = new FormData()
      form.append('file', file)
      form.append('org_id', orgId)
      if (reportName?.trim()) {
        form.append('report_name', reportName.trim())
      }
      if (reportType) {
        form.append('report_type', reportType)
      }
      // Do NOT set Content-Type — browser must set it with the multipart boundary
      return fetch(`${API_URL}/upload/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }).then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new ApiError(res.status, body.detail ?? 'Upload failed')
        }
        return res.json()
      })
    },
  },

  threads: {
    create: (body: { dataset_id: string; title?: string }, token: string, orgId?: string) =>
      apiFetch<Thread>(withQuery('/threads/', { org_id: orgId }), {
        method: 'POST',
        body: JSON.stringify(body),
        token,
        timeoutMs: 12_000,
      }),

    list: (token: string, orgId?: string, datasetId?: string, opts?: { search?: string; limit?: number; offset?: number }) =>
      apiFetch<Thread[]>(
        withQuery('/threads/', {
          org_id: orgId,
          dataset_id: datasetId,
          search: opts?.search || undefined,
          limit: opts?.limit != null ? String(opts.limit) : undefined,
          offset: opts?.offset != null ? String(opts.offset) : undefined,
        }),
        { token, timeoutMs: 10_000 },
      ),

    get: (threadId: string, token: string) =>
      apiFetch<Thread>(`/threads/${threadId}`, { token, timeoutMs: 10_000 }),

    messages: (threadId: string, token: string) =>
      apiFetch<Message[]>(`/threads/${threadId}/messages`, { token, timeoutMs: 10_000 }),

    escalate: (threadId: string, token: string) =>
      apiFetch<{ escalated: boolean; support_message_id: string }>(
        `/threads/${threadId}/escalate`,
        { method: 'POST', token, timeoutMs: 12_000 },
      ),

    /**
     * Ask the backend to run a quick Reflexion-validated insight on the thread's
     * dataset and persist it as the first assistant message.
     * A 15 s client-side AbortSignal mirrors the server-side timeout so the
     * browser never hangs indefinitely.
     */
    proactiveInsight: (threadId: string, token: string) =>
      apiFetch<{ thread_id: string; message_id: string; insight: string }>(
        `/threads/${threadId}/proactive-insight`,
        {
          method: 'POST',
          token,
          timeoutMs: 60_000,
          // AbortSignal.timeout() is supported in all modern browsers (Chrome 103+, FF 100+)
          signal: AbortSignal.timeout(60_000),
        },
      ),
  },

  analytics: {
    // Fire-and-forget: ask the backend to pre-load the dataset Parquet into its
    // in-memory cache so the next compute() call hits the cache instantly.
    // Never throws — errors are silently ignored since this is best-effort.
    warm: (datasetId: string, token: string, orgId?: string): void => {
      apiFetch<{ status: string }>(withQuery('/analytics/warm', { org_id: orgId }), {
        method: 'POST',
        body: JSON.stringify({ dataset_id: datasetId }),
        token,
        timeoutMs: 10_000,
      }).catch(() => { /* intentionally silenced — warm is best-effort */ })
    },

    compute: (body: AnalyticsRequest, token: string, orgId?: string) =>
      apiFetch<AnalyticsResult>(withQuery('/analytics/compute', { org_id: orgId }), {
        method: 'POST',
        body: JSON.stringify(body),
        token,
        // Raised from 20 s → 45 s to accommodate cold Parquet downloads from
        // Supabase Storage on first load. With pre-warming, this will rarely
        // be reached, but prevents spurious timeout errors as a safety net.
        timeoutMs: 45_000,
        cacheMs: 5 * 60_000, // Cache heavy analytics for 5 minutes
      }),

    getInsights: (body: InsightsRequest, token: string, orgId?: string) =>
      apiFetch<InsightsResult>(withQuery('/analytics/insights', { org_id: orgId }), {
        method: 'POST',
        body: JSON.stringify(body),
        token,
        timeoutMs: 95_000,
        cacheMs: 5 * 60_000, // Cache insights for 5 minutes
      }),
  },

  events: {
    log: (body: { event_type: string; event_metadata?: Record<string, unknown> }, token: string) =>
      apiFetch<void>('/events/', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
        timeoutMs: 10_000,
      }),
  },

  support: {
    send: (body: { email: string; message: string }, token: string) =>
      apiFetch<{ id: string }>('/support/', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
        timeoutMs: 12_000,
      }),

    list: (token: string, status?: string) =>
      apiFetch<Array<{ id: string; user_id: string; organization_id: string; email: string; message: string; status: string; created_at: string }>>(
        withQuery('/support/', { status }),
        { token, timeoutMs: 10_000 },
      ),

    resolve: (id: string, token: string) =>
      apiFetch<{ id: string; status: string }>(`/support/${id}`, {
        method: 'PATCH',
        token,
        timeoutMs: 10_000,
      }),
  },

  help: {
    listPublished: () =>
      apiFetch<HelpArticle[]>('/help/articles', { timeoutMs: 10_000 }),

    listAll: (token: string) =>
      apiFetch<HelpArticle[]>('/help/articles/all', { token, timeoutMs: 10_000 }),

    create: (
      body: { title: string; body: string; category: string; sort_order: number; is_published: boolean },
      token: string,
    ) =>
      apiFetch<HelpArticle>('/help/articles', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
        timeoutMs: 10_000,
      }),

    update: (
      id: string,
      body: Partial<{ title: string; body: string; category: string; sort_order: number; is_published: boolean }>,
      token: string,
    ) =>
      apiFetch<HelpArticle>(`/help/articles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        token,
        timeoutMs: 10_000,
      }),

    delete: (id: string, token: string) =>
      apiFetch<void>(`/help/articles/${id}`, { method: 'DELETE', token, timeoutMs: 10_000 }),
  },
}

/**
 * Stream a chat response from the SSE endpoint.
 * Usage:
 *   for await (const chunk of streamChat(threadId, message, token)) {
 *     if (chunk.done) break
 *     if (chunk.token) appendToMessage(chunk.token)
 *   }
 */
export async function* streamChat(
  threadId: string,
  message: string,
  token: string,
  signal?: AbortSignal,
  pageContext?: string,
): AsyncGenerator<{ token?: string; done?: boolean; error?: string; status?: string; requires_escalation?: boolean }> {
  const res = await fetch(`${API_URL}/threads/${threadId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, ...(pageContext ? { page_context: pageContext } : {}) }),
    signal,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail ?? 'Chat request failed')
  }

  if (!res.body) throw new ApiError(res.status, 'No response body from chat stream')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6))
          yield parsed
          if (parsed.done) return
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  }
}
