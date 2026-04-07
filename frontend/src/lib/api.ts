import type {
  Dataset,
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers: extraHeaders, ...fetchOptions } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers })

  // C2: 401 auto-refresh — try to get a fresh token and retry once
  if (res.status === 401 && token) {
    const supabase = createClient()
    const { data } = await supabase.auth.refreshSession()
    if (data.session) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
      res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers })
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail ?? 'Request failed')
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
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
      apiFetch<UserProfile>('/auth/me', { token }),
  },

  organizations: {
    list: (token: string) =>
      apiFetch<Organization[]>('/organizations/', { token }),

    create: (body: { name: string }, token: string) =>
      apiFetch<Organization>('/organizations/', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),
  },

  datasets: {
    list: (token: string, orgId?: string, allOrgs?: boolean) =>
      apiFetch<{ datasets: Dataset[] }>(
        withQuery('/datasets/', { org_id: orgId, all_orgs: allOrgs ? 'true' : undefined }),
        { token },
      ).then(r => r.datasets),

    get: (id: string, token: string) =>
      apiFetch<Dataset>(`/datasets/${id}`, { token }),

    delete: (id: string, token: string) =>
      apiFetch<void>(`/datasets/${id}`, { method: 'DELETE', token }),

    upload: (
      file: File,
      orgId: string,
      token: string,
      reportName?: string,
    ): Promise<{ dataset_id: string }> => {
      const form = new FormData()
      form.append('file', file)
      form.append('org_id', orgId)
      if (reportName?.trim()) {
        form.append('report_name', reportName.trim())
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
      }),

    list: (token: string, orgId?: string, datasetId?: string) =>
      apiFetch<Thread[]>(withQuery('/threads/', { org_id: orgId, dataset_id: datasetId }), { token }),

    messages: (threadId: string, token: string) =>
      apiFetch<Message[]>(`/threads/${threadId}/messages`, { token }),

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
          // AbortSignal.timeout() is supported in all modern browsers (Chrome 103+, FF 100+)
          signal: AbortSignal.timeout(15_000),
        },
      ),
  },

  analytics: {
    compute: (body: AnalyticsRequest, token: string, orgId?: string) =>
      apiFetch<AnalyticsResult>(withQuery('/analytics/compute', { org_id: orgId }), {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),

    getInsights: (body: InsightsRequest, token: string, orgId?: string) =>
      apiFetch<InsightsResult>(withQuery('/analytics/insights', { org_id: orgId }), {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),
  },

  events: {
    log: (body: { event_type: string; event_metadata?: Record<string, unknown> }, token: string) =>
      apiFetch<void>('/events/', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),
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
): AsyncGenerator<{ token?: string; done?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/threads/${threadId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
    signal,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail ?? 'Chat request failed')
  }

  const reader = res.body!.getReader()
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
