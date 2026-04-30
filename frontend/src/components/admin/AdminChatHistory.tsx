'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import {
  Bot,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Inbox,
  Loader2,
  MessageSquare,
  Monitor,
  Search,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import type { Dataset, Message, Thread } from '@/types'

// ── Chart rendering (read-only mirror of ChatWidget's inline chart) ────────────

type ChartSeries = { key: string; label?: string; color?: string }
type ChartDataPoint = Record<string, string | number | null>
type ChatChartPayload = {
  type: 'bar' | 'line'
  title?: string
  xKey?: string
  data: ChartDataPoint[]
  series?: ChartSeries[]
}
type AssistantSegment =
  | { type: 'markdown'; content: string }
  | { type: 'chart'; chart: ChatChartPayload }

const CHART_TAG_REGEX = /<chart>([\s\S]*?)<\/chart>/gi
const DEFAULT_CHART_COLORS = ['#f5b800', '#3b82f6', '#22c55e', '#f97316']
const PAGE_SIZE = 50

function inferChartSeries(data: ChartDataPoint[], xKey: string): ChartSeries[] {
  const first = data[0] ?? {}
  return Object.keys(first)
    .filter((k) => k !== xKey && typeof first[k] === 'number')
    .map((k, i) => ({
      key: k,
      label: k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      color: DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length],
    }))
}

function normalizeChartPayload(raw: unknown): ChatChartPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const type = p.type === 'line' ? 'line' : p.type === 'bar' ? 'bar' : null
  const data = Array.isArray(p.data)
    ? (p.data.filter((x) => x && typeof x === 'object') as ChartDataPoint[])
    : []
  if (!type || data.length === 0) return null
  const xKey =
    typeof p.xKey === 'string' && p.xKey
      ? p.xKey
      : Object.keys(data[0] ?? {}).find((k) => typeof data[0]?.[k] === 'string') ?? 'label'
  const explicit = Array.isArray(p.series)
    ? (p.series
      .filter((s) => s && typeof s === 'object')
      .map((s, i) => {
        const item = s as Record<string, unknown>
        if (typeof item.key !== 'string') return null
        return {
          key: item.key,
          label: typeof item.label === 'string' ? item.label : item.key,
          color:
            typeof item.color === 'string'
              ? item.color
              : DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length],
        }
      })
      .filter(Boolean) as ChartSeries[])
    : []
  const series = explicit.length > 0 ? explicit : inferChartSeries(data, xKey)
  if (series.length === 0) return null
  return { type, title: typeof p.title === 'string' ? p.title : undefined, xKey, data, series }
}

function parseAssistantContent(content: string): AssistantSegment[] {
  const segments: AssistantSegment[] = []
  let lastIndex = 0
  for (const match of content.matchAll(CHART_TAG_REGEX)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      const md = content.slice(lastIndex, start).trim()
      if (md) segments.push({ type: 'markdown', content: md })
    }
    try {
      const chart = normalizeChartPayload(JSON.parse(match[1]))
      if (chart) segments.push({ type: 'chart', chart })
    } catch { /* skip malformed */ }
    lastIndex = start + match[0].length
  }
  const tail = content.slice(lastIndex).trim()
  if (tail) segments.push({ type: 'markdown', content: tail })
  return segments
}

function stripChartTags(content: string): string {
  return content.replace(/<chart>[\s\S]*?<\/chart>/gi, '[chart]').trim()
}

function InlineChart({ chart }: { chart: ChatChartPayload }) {
  const xKey = chart.xKey ?? 'label'
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#e4ddd2] bg-white/80 px-3 py-3">
      {chart.title && (
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.02em] text-[#57524a]">
          {chart.title}
        </p>
      )}
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'bar' ? (
            <BarChart data={chart.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e8e1d7" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8e1d7', borderRadius: 14 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series?.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={s.color ?? DEFAULT_CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={chart.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e8e1d7" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8e1d7', borderRadius: 14 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series?.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color ?? DEFAULT_CHART_COLORS[0]} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="leading-7 [&:not(:first-child)]:mt-3">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-[#1f1a17]">{children}</strong>,
        ul: ({ children }) => <ul className="mt-3 list-disc space-y-2 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mt-3 list-decimal space-y-2 pl-5">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-2xl border border-[#e4ddd2] bg-white/80">
            <table className="min-w-full border-collapse text-left text-[0.82rem]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[#f8f3e8] text-[#504b45]">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-t border-[#eee6da]">{children}</tr>,
        th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-[#3f3a35]">{children}</td>,
        code: ({ children }) => (
          <code className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[0.82rem] text-[#4c4032]">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-2xl border border-[#e4ddd2] bg-white/80 px-4 py-3 text-[0.82rem]">
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function renderMessageContent(content: string): ReactNode {
  const segments = parseAssistantContent(content.replace(/\r\n/g, '\n'))
  if (segments.length === 0) return null
  return segments.map((seg, i) =>
    seg.type === 'chart'
      ? <InlineChart key={i} chart={seg.chart} />
      : <MarkdownBlock key={i} content={seg.content} />,
  )
}

// ── Context badge helpers ──────────────────────────────────────────────────────

type ContextInfo = { label: string; badgeCls: string; dotCls: string }

function getContextInfo(reportType: string): ContextInfo {
  if (reportType === 'google_ads')
    return {
      label: 'Google Ads Dashboard',
      badgeCls: 'bg-blue-50 text-blue-700 ring-blue-200',
      dotCls: 'bg-blue-400',
    }
  if (reportType === 'meta_ads')
    return {
      label: 'Meta Ads Dashboard',
      badgeCls: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
      dotCls: 'bg-indigo-400',
    }
  return {
    label: reportType.replace(/_/g, ' '),
    badgeCls: 'bg-slate-100 text-slate-600 ring-slate-200',
    dotCls: 'bg-slate-400',
  }
}

// ── Transcript export ──────────────────────────────────────────────────────────

function formatTranscript(thread: Thread, messages: Message[], contextLabel: string): string {
  const header = [
    `SpokesBot Conversation Transcript`,
    `Thread: ${thread.title || 'New Conversation'}`,
    `Context: ${contextLabel}`,
    `Date: ${format(parseISO(thread.created_at), 'MMMM d, yyyy h:mm a')}`,
    '─'.repeat(60),
    '',
  ].join('\n')

  const body = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const speaker = m.role === 'user' ? 'User' : 'SpokesBot'
      const time = format(parseISO(m.created_at), 'h:mm a')
      const text = stripChartTags(m.content)
      return `[${time}] ${speaker}:\n${text}`
    })
    .join('\n\n')

  return header + body
}

// ── Skeleton loader ────────────────────────────────────────────────────────────

function ThreadSkeleton() {
  return (
    <div className="space-y-px">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="px-4 py-3.5 border-b border-[#f0ebe2]">
          <div className="flex items-start gap-2.5">
            <div className="shimmer-cool mt-0.5 h-7 w-7 flex-shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="shimmer-cool h-3.5 rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
              <div className="flex gap-1.5">
                <div className="shimmer-cool h-2.5 w-20 rounded-full" />
                <div className="shimmer-cool h-2.5 w-24 rounded" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function MessagesSkeleton() {
  return (
    <div className="space-y-5 px-6 py-5">
      {[...Array(5)].map((_, i) => {
        const isUser = i % 2 === 0
        return (
          <div key={i} className={`flex ${isUser ? 'justify-end' : 'items-start gap-2.5'}`}>
            {!isUser && <div className="shimmer-cool h-8 w-8 flex-shrink-0 rounded-full" />}
            <div className={`space-y-1.5 ${isUser ? 'w-48' : 'w-64'}`}>
              <div className="shimmer-cool rounded-2xl" style={{ height: 36 + (i % 3) * 12 }} />
              <div
                className="shimmer-cool h-3 w-12 rounded"
                style={{ marginLeft: isUser ? 'auto' : 0 }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AdminChatHistoryProps {
  orgId: string
  orgName?: string
  datasets: Dataset[]
}

export function AdminChatHistory({ orgId, orgName, datasets }: AdminChatHistoryProps) {
  const { session } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()

  // Thread list state
  const [threads, setThreads] = useState<Thread[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [threadsError, setThreadsError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [pageOffset, setPageOffset] = useState(0)

  // Transcript state
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
  })

  // Dataset lookup map
  const datasetMap = new Map(datasets.map((d) => [d.id, d]))

  // ── Fetch threads (initial + load-more + search) ───────────────────────────
  const fetchThreads = useCallback(async (
    search: string,
    offset: number,
    append: boolean,
  ) => {
    if (!session) return
    if (offset === 0) { setLoadingThreads(true) } else { setLoadingMore(true) }
    setThreadsError(null)
    try {
      const data = await api.threads.list(session.access_token, orgId, undefined, {
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      })
      setHasMore(data.length === PAGE_SIZE)
      setThreads((prev) => append ? [...prev, ...data] : data)
      setPageOffset(offset)
    } catch (e) {
      setThreadsError(e instanceof Error ? e.message : 'Failed to load conversations.')
    } finally {
      setLoadingThreads(false)
      setLoadingMore(false)
    }
  }, [session, orgId])

  // Initial load
  useEffect(() => {
    void fetchThreads('', 0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, orgId])

  // Debounced search: 350 ms after user stops typing
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      if (searchQuery === appliedSearch) return
      setAppliedSearch(searchQuery)
      setSelectedThread(null)
      void fetchThreads(searchQuery, 0, false)
    }, 350)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  function handleLoadMore() {
    void fetchThreads(appliedSearch, pageOffset + PAGE_SIZE, true)
  }

  // ── Load messages for selected thread ────────────────────────────────────────
  useEffect(() => {
    if (!session || !selectedThread) {
      setMessages([])
      return
    }
    let cancelled = false
    setLoadingMessages(true)
    setMessagesError(null)
    api.threads
      .messages(selectedThread.id, session.access_token)
      .then((data) => { if (!cancelled) setMessages(data) })
      .catch((e) => { if (!cancelled) setMessagesError(e instanceof Error ? e.message : 'Failed to load messages.') })
      .finally(() => { if (!cancelled) setLoadingMessages(false) })
    return () => { cancelled = true }
  }, [session, selectedThread])

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Export: copy transcript to clipboard ──────────────────────────────────
  async function handleCopyTranscript() {
    if (!selectedThread || messages.length === 0) return
    const dataset = datasetMap.get(selectedThread.dataset_id)
    const ctx = dataset ? getContextInfo(dataset.report_type) : { label: 'Unknown', badgeCls: '', dotCls: '' }
    const text = formatTranscript(selectedThread, messages, ctx.label)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toastSuccess('Transcript copied to clipboard.')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toastError('Clipboard access denied. Please allow clipboard permissions.')
    }
  }

  // ── Thread list item ──────────────────────────────────────────────────────
  function ThreadItem({ thread }: { thread: Thread }) {
    const isSelected = selectedThread?.id === thread.id
    const dataset = datasetMap.get(thread.dataset_id)
    const ctx = dataset ? getContextInfo(dataset.report_type) : null
    const dateLabel = (() => {
      try { return format(parseISO(thread.created_at), 'MMM d, yyyy · h:mm a') }
      catch { return thread.created_at }
    })()

    return (
      <button
        onClick={() => setSelectedThread(thread)}
        className={`w-full text-left px-4 py-3.5 border-b border-[#f0ebe2] transition-colors ${isSelected
            ? 'bg-[#fff9e5] border-l-[3px] border-l-[#f0a500]'
            : 'hover:bg-[#faf7f2] border-l-[3px] border-l-transparent'
          }`}
      >
        <div className="flex items-start gap-2.5">
          <div className={`mt-0.5 flex-shrink-0 rounded-full p-1.5 ${isSelected ? 'bg-[#f0a500]/15' : 'bg-slate-100'}`}>
            <MessageSquare className={`h-3 w-3 ${isSelected ? 'text-[#f0a500]' : 'text-slate-400'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[13px] font-medium leading-snug ${isSelected ? 'text-[#b37800]' : 'text-slate-700'}`}>
              {thread.title || 'New Conversation'}
            </p>

            {/* Context + report badge row */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {ctx && (
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${ctx.badgeCls}`}>
                  <Monitor className="h-2.5 w-2.5 flex-shrink-0" />
                  {ctx.label}
                </span>
              )}
            </div>

            {/* Timestamp row */}
            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-2.5 w-2.5 flex-shrink-0" />
              {dateLabel}
            </div>
          </div>
        </div>
      </button>
    )
  }

  // ── Message bubble ─────────────────────────────────────────────────────────
  function MessageBubble({ message }: { message: Message }) {
    const isUser = message.role === 'user'
    const timeLabel = (() => {
      try { return format(parseISO(message.created_at), 'h:mm a') }
      catch { return '' }
    })()

    if (isUser) {
      return (
        <div className="flex justify-end">
          <div className="max-w-[75%]">
            <div className="rounded-2xl rounded-tr-sm bg-[#f5b800] px-4 py-2.5 text-sm text-[#1a1208] shadow-sm">
              {message.content}
            </div>
            <p className="mt-1 pr-1 text-right text-[10px] text-slate-400">{timeLabel}</p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex-shrink-0 rounded-full bg-gradient-to-br from-[#f0a500] to-[#e08c00] p-1.5 shadow-sm">
          <Bot className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="max-w-[80%]">
          <div className="rounded-2xl rounded-tl-sm border border-[#e8e0d4] bg-white/90 px-4 py-3 text-sm text-[#2d2924] shadow-sm">
            {renderMessageContent(message.content)}
          </div>
          <p className="mt-1 pl-1 text-[10px] text-slate-400">{timeLabel}</p>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedDataset = selectedThread ? datasetMap.get(selectedThread.dataset_id) : null
  const selectedCtx = selectedDataset ? getContextInfo(selectedDataset.report_type) : null
  const visibleMessages = messages.filter((m) => m.role !== 'system')

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[520px] overflow-hidden">

      {/* ── Left pane: thread list ─────────────────────────────────────────── */}
      <div className="flex w-72 flex-shrink-0 flex-col border-r border-[#e7e1d6] bg-white lg:w-80">

        {/* Pane header */}
        <div className="border-b border-[#e7e1d6] px-4 pt-3.5 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              {orgName ? `${orgName}'s Chats` : 'Conversations'}
            </h3>
            {!loadingThreads && (
              <span className="text-[11px] text-slate-400 tabular-nums">
                {threads.length}{hasMore ? '+' : ''} thread{threads.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Search bar — filters threads by title, NOT a message input */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search conversations…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#e7e1d6] bg-[#faf7f3] py-1.5 pl-8 pr-3 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-[#f0a500] focus:outline-none focus:ring-1 focus:ring-[#f0a500]/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Thread list */}
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <ThreadSkeleton />
          ) : threadsError ? (
            <div className="px-4 py-6 text-center text-xs text-red-500">{threadsError}</div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <Inbox className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">
                {appliedSearch ? `No conversations matching "${appliedSearch}".` : 'No conversations yet.'}
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const t = threads[virtualRow.index]
                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <ThreadItem thread={t} />
                    </div>
                  )
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="border-t border-[#f0ebe2] p-3">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e7e1d6] bg-white py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-[#faf7f3] hover:text-slate-800 disabled:opacity-60"
                  >
                    {loadingMore ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right pane: transcript ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden bg-[#faf7f3]">
        {selectedThread ? (
          <>
            {/* Transcript header */}
            <div className="border-b border-[#e7e1d6] bg-white px-6 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {selectedThread.title || 'Conversation'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {selectedCtx && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${selectedCtx.badgeCls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${selectedCtx.dotCls}`} />
                        {selectedCtx.label}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {(() => {
                        try { return format(parseISO(selectedThread.created_at), 'EEEE, MMMM d, yyyy') }
                        catch { return selectedThread.created_at }
                      })()}
                    </span>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {/* Read-only badge */}
                  <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Read-only
                  </span>

                  {/* Export: copy transcript */}
                  <button
                    onClick={handleCopyTranscript}
                    disabled={loadingMessages || visibleMessages.length === 0}
                    title={copied ? 'Copied!' : 'Copy transcript to clipboard'}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition-all disabled:opacity-40 ${copied
                        ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-[#e7e1d6] bg-white text-slate-600 hover:border-[#f0a500]/50 hover:bg-[#fff9e5] hover:text-[#a36200]'
                      }`}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy transcript
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {loadingMessages ? (
                <MessagesSkeleton />
              ) : messagesError ? (
                <div className="flex items-center justify-center py-12 text-sm text-red-500">
                  {messagesError}
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <MessageSquare className="h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-400">No messages in this conversation.</p>
                </div>
              ) : (
                <div className="space-y-4 px-6 py-5">
                  {visibleMessages.map((m) => <MessageBubble key={m.id} message={m} />)}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#e7e1d6]">
              <MessageSquare className="h-9 w-9 text-[#f0a500]/50" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Select a conversation to view the transcript</p>
              <p className="mt-1 text-xs text-slate-400">
                Click any thread on the left to read the full chat history.
              </p>
            </div>
            {!loadingThreads && threads.length > 0 && (
              <p className="text-[11px] text-slate-300">
                {threads.length}{hasMore ? '+' : ''} conversation{threads.length !== 1 ? 's' : ''} available
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
