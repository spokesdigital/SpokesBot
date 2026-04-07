'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import { api, streamChat } from '@/lib/api'
import type { Thread, Message, Dataset } from '@/types'
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
import {
  RefreshCw,
  Minus,
  X,
  MessageCircle,
  BookOpen,
  Headphones,
  Send,
  Sparkles,
  Square,
} from 'lucide-react'

type ChartSeries = {
  key: string
  label?: string
  color?: string
}

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

interface ChatWidgetProps {
  open: boolean
  onClose: () => void
}

const CHART_TAG_REGEX = /<chart>([\s\S]*?)<\/chart>/gi
const DEFAULT_CHART_COLORS = ['#f5b800', '#3b82f6', '#22c55e', '#f97316']

function resolveDatasetId(datasets: Dataset[], activeDatasetId: string | null) {
  if (activeDatasetId) return activeDatasetId
  return datasets.find((dataset) => dataset.status === 'completed')?.id ?? null
}

function normalizeMarkdownMath(content: string) {
  return content
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expr: string) => `$$${expr.trim()}$$`)
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_, expr: string) => `$${expr.trim()}$`)
}

function inferChartSeries(data: ChartDataPoint[], xKey: string) {
  const firstRow = data[0] ?? {}
  return Object.keys(firstRow)
    .filter((key) => key !== xKey && typeof firstRow[key] === 'number')
    .map((key, index) => ({
      key,
      label: key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      color: DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
    }))
}

function normalizeChartPayload(raw: unknown): ChatChartPayload | null {
  if (!raw || typeof raw !== 'object') return null

  const payload = raw as Record<string, unknown>
  const type = payload.type === 'line' ? 'line' : payload.type === 'bar' ? 'bar' : null
  const data = Array.isArray(payload.data) ? payload.data.filter((item) => item && typeof item === 'object') as ChartDataPoint[] : []

  if (!type || data.length === 0) return null

  const xKey =
    typeof payload.xKey === 'string' && payload.xKey
      ? payload.xKey
      : Object.keys(data[0] ?? {}).find((key) => typeof data[0]?.[key] === 'string') ?? 'label'

  const explicitSeries = Array.isArray(payload.series)
    ? payload.series
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => {
          const series = item as Record<string, unknown>
          if (typeof series.key !== 'string') return null
          return {
            key: series.key,
            label: typeof series.label === 'string' ? series.label : series.key,
            color: typeof series.color === 'string' ? series.color : DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
          }
        })
        .filter(Boolean) as ChartSeries[]
    : []

  const series = explicitSeries.length > 0 ? explicitSeries : inferChartSeries(data, xKey)
  if (series.length === 0) return null

  return {
    type,
    title: typeof payload.title === 'string' ? payload.title : undefined,
    xKey,
    data,
    series,
  }
}

function stripIncompleteChartTag(content: string) {
  const lastOpen = content.lastIndexOf('<chart>')
  const lastClose = content.lastIndexOf('</chart>')
  if (lastOpen !== -1 && lastOpen > lastClose) {
    return content.slice(0, lastOpen).trimEnd()
  }
  return content
}

function parseAssistantContent(content: string, streaming = false): AssistantSegment[] {
  const normalized = streaming ? stripIncompleteChartTag(content) : content
  const segments: AssistantSegment[] = []
  let lastIndex = 0

  for (const match of normalized.matchAll(CHART_TAG_REGEX)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      const markdown = normalized.slice(lastIndex, start).trim()
      if (markdown) {
        segments.push({ type: 'markdown', content: markdown })
      }
    }

    try {
      const parsed = JSON.parse(match[1])
      const chart = normalizeChartPayload(parsed)
      if (chart) {
        segments.push({ type: 'chart', chart })
      }
    } catch {
      // Ignore malformed chart payloads and keep the text readable.
    }

    lastIndex = start + match[0].length
  }

  const trailingMarkdown = normalized.slice(lastIndex).trim()
  if (trailingMarkdown) {
    segments.push({ type: 'markdown', content: trailingMarkdown })
  }

  return segments
}

function buildSuggestedFollowUps(question: string, answer: string) {
  const source = `${question} ${answer}`.toLowerCase()
  const suggestions: string[] = []

  const push = (value: string) => {
    if (!suggestions.includes(value)) suggestions.push(value)
  }

  if (source.includes('compare') || source.includes('vs') || source.includes('<chart>')) {
    push('Break this down by campaign.')
    push('Show me the 30-day trend.')
  }
  if (source.includes('delivery') || source.includes('in-store') || source.includes('store')) {
    push('Which channel has the stronger ROAS?')
  }
  if (source.includes('|') || source.includes('table')) {
    push('Summarize the table in plain English.')
  }
  if (source.includes('revenue') || source.includes('sales')) {
    push('What should I optimize first?')
  }

  push('Give me three recommended actions.')

  return suggestions.slice(0, 3)
}

function InlineChart({ chart }: { chart: ChatChartPayload }) {
  const xAxisKey = chart.xKey ?? 'label'

  return (
    <div
      data-testid="chat-inline-chart"
      className="mt-3 overflow-hidden rounded-2xl border border-[#e4ddd2] bg-white/80 px-3 py-3"
    >
      {chart.title ? (
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.02em] text-[#57524a]">
          {chart.title}
        </p>
      ) : null}
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'bar' ? (
            <BarChart data={chart.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e8e1d7" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xAxisKey} tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e8e1d7',
                  borderRadius: '14px',
                  boxShadow: '0 16px 36px rgba(15, 23, 42, 0.12)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series?.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label ?? series.key}
                  fill={series.color ?? DEFAULT_CHART_COLORS[0]}
                  radius={[8, 8, 0, 0]}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart data={chart.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e8e1d7" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xAxisKey} tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e8e1d7',
                  borderRadius: '14px',
                  boxShadow: '0 16px 36px rgba(15, 23, 42, 0.12)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series?.map((series) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label ?? series.key}
                  stroke={series.color ?? DEFAULT_CHART_COLORS[0]}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
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
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
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
      {normalizeMarkdownMath(content)}
    </ReactMarkdown>
  )
}

function renderMessageContent(content: string, streaming = false): ReactNode {
  const segments = parseAssistantContent(content.replace(/\r\n/g, '\n'), streaming)

  if (segments.length === 0) {
    return null
  }

  return segments.map((segment, index) => {
    if (segment.type === 'chart') {
      return <InlineChart key={`chart-${index}`} chart={segment.chart} />
    }

    return <MarkdownBlock key={`markdown-${index}`} content={segment.content} />
  })
}

// ── Typing dots indicator ─────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="flex gap-1 items-center h-4">
      <span className="h-2 w-2 animate-bounce rounded-full bg-[#f0a500] [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-[#f0a500] [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-[#f0a500] [animation-delay:300ms]" />
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatWidget({ open, onClose }: ChatWidgetProps) {
  const { session, user } = useAuth()
  const { organizationId, activeDatasetId, setActiveDataset } = useDashboardStore()

  const [isRendered, setIsRendered] = useState(open)
  const [tab, setTab] = useState<'messages' | 'articles'>('messages')
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(false)
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([])
  const [minimized, setMinimized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Proactive insight state
  const [insightLoading, setInsightLoading] = useState(false)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  // AbortController for cancelling in-flight streaming requests
  const abortRef = useRef<AbortController | null>(null)

  // Abort any in-flight stream on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  const loadDatasets = useCallback(async () => {
    if (!session) return [] as Dataset[]

    setDatasetsLoading(true)
    try {
      const targetOrgId = user?.role === 'admin' ? organizationId ?? undefined : undefined
      const nextDatasets = await api.datasets.list(session.access_token, targetOrgId)
      setDatasets(nextDatasets)

      const fallbackDatasetId = resolveDatasetId(nextDatasets, activeDatasetId)
      if (fallbackDatasetId && !activeDatasetId) {
        setActiveDataset(fallbackDatasetId)
      }

      return nextDatasets
    } catch {
      return [] as Dataset[]
    } finally {
      setDatasetsLoading(false)
    }
  }, [session, user?.role, organizationId, activeDatasetId, setActiveDataset])

  /* ── Load datasets once session is ready ── */
  useEffect(() => {
    if (!session || !open) return
    void loadDatasets()
  }, [session, open, loadDatasets])

  function scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
  }

  /* ── Manually triggered insight ── */
  async function handleProactiveInsight() {
    if (!session || !activeDatasetId) return
    setInsightLoading(true)
    setError(null)

    try {
      // 1. Create a fresh thread for this insight session
      const orgId = user?.role === 'admin' ? organizationId ?? undefined : undefined
      const thread = await api.threads.create(
        { dataset_id: activeDatasetId, title: 'Dashboard Insight' },
        session.access_token,
        orgId,
      )
      setActiveThread(thread)

      // 2. Ask the backend to run the Reflexion agent and return a validated insight
      const response = await api.threads.proactiveInsight(thread.id, session.access_token)

      // 3. Inject the insight as the first AI message in the thread
      setMessages([
        {
          id: response.message_id,
          thread_id: thread.id,
          role: 'assistant',
          content: response.insight,
          created_at: new Date().toISOString(),
        },
      ])
      setSuggestedFollowUps(buildSuggestedFollowUps('proactive insight', response.insight))
    } catch {
      setError('Failed to generate insight.')
    } finally {
      setInsightLoading(false)
    }
  }

  /* ── Load messages when thread changes ── */
  useEffect(() => {
    if (!session || !activeThread) return
    api.threads
      .messages(activeThread.id, session.access_token)
      .then(setMessages)
      .catch(() => {})
  }, [session, activeThread])

  /* ── Scroll to bottom ── */
  useEffect(() => {
    scrollToBottom('smooth')
  }, [messages.length, insightLoading])

  useEffect(() => {
    if (!streaming && !streamingContent) return
    const frame = window.requestAnimationFrame(() => scrollToBottom('auto'))
    return () => window.cancelAnimationFrame(frame)
  }, [streaming, streamingContent])

  useEffect(() => {
    if (suggestedFollowUps.length === 0) return
    const frame = window.requestAnimationFrame(() => scrollToBottom('smooth'))
    return () => window.cancelAnimationFrame(frame)
  }, [suggestedFollowUps])

  useEffect(() => {
    if (open) {
      setIsRendered(true)
      return
    }

    const timeoutId = window.setTimeout(() => setIsRendered(false), 320)
    return () => window.clearTimeout(timeoutId)
  }, [open])

  /* ── Send message ── */
  async function submitMessage(rawMessage: string) {
    if (!session || !rawMessage.trim() || streaming) return

    const userMessage = rawMessage.trim().slice(0, 500)
    const currentDatasetId = resolveDatasetId(datasets, activeDatasetId)

    let thread = activeThread
    if (!thread) {
      let datasetId = currentDatasetId
      if (!datasetId) {
        const refreshedDatasets = await loadDatasets()
        datasetId = resolveDatasetId(refreshedDatasets, useDashboardStore.getState().activeDatasetId)
      }
      if (!datasetId) {
        setError(datasetsLoading ? 'Loading your reports… please try again in a moment.' : 'Please upload a completed dataset first.')
        return
      }
      setError(null)
      try {
        thread = await api.threads.create(
          { dataset_id: datasetId, title: userMessage.slice(0, 60) },
          session.access_token,
          user?.role === 'admin' ? organizationId ?? undefined : undefined,
        )
        setActiveThread(thread)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to create conversation.')
        return
      }
    }

    setInput('')
    setStreaming(true)
    setStreamingContent('')
    setSuggestedFollowUps([])

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      thread_id: thread.id,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    // Create a fresh AbortController for this request
    const controller = new AbortController()
    abortRef.current = controller

    let accumulated = ''
    try {
      for await (const chunk of streamChat(thread.id, userMessage, session.access_token, controller.signal)) {
        if (chunk.error) throw new Error(chunk.error)
        if (chunk.done) break
        if (chunk.token) {
          accumulated += chunk.token
          setStreamingContent(accumulated)
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `stream-${Date.now()}`,
          thread_id: thread!.id,
          role: 'assistant',
          content: accumulated,
          created_at: new Date().toISOString(),
        },
      ])
      setSuggestedFollowUps(buildSuggestedFollowUps(userMessage, accumulated))
    } catch (e: unknown) {
      // Ignore abort errors — user intentionally cancelled
      if (e instanceof Error && e.name !== 'AbortError') {
        setError(e.message)
      }
    } finally {
      setStreamingContent('')
      setStreaming(false)
      abortRef.current = null
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    await submitMessage(input)
  }

  /* ── Stop streaming ── */
  function stopStreaming() {
    abortRef.current?.abort()
  }

  /* ── Reset conversation ── */
  function resetChat() {
    abortRef.current?.abort()
    setActiveThread(null)
    setMessages([])
    setStreamingContent('')
    setSuggestedFollowUps([])
    setError(null)
  }

  if (!isRendered) return null

  const resolvedDatasetId = resolveDatasetId(datasets, activeDatasetId)
  const hasDataset = Boolean(resolvedDatasetId)

  // Show welcome message only when there are no messages AND we're not fetching an insight
  const showWelcome = messages.length === 0 && !streaming && !insightLoading

  return (
    /* Fixed overlay — bottom-right, above the FAB */
    <div
      data-testid="chat-widget"
      className={`fixed bottom-28 right-7 z-50 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-5 scale-[0.96] opacity-0'
      }`}
      style={{ width: 380 }}
    >
      {/* Panel */}
      <div
        className="flex flex-col overflow-hidden rounded-[1.6rem] shadow-[0_32px_80px_rgba(0,0,0,0.18)] transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ height: minimized ? 'auto' : 520 }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between bg-gradient-to-b from-[#f0a500]/95 to-[#e69d00]/90 backdrop-blur-md px-5 py-4">
          <span className="text-[1.05rem] font-bold text-white tracking-[-0.01em]">
            Spokes AI Assistant
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={resetChat}
              aria-label="Reset conversation"
              className="text-white/80 transition hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMinimized((m) => !m)}
              aria-label={minimized ? 'Expand' : 'Minimise'}
              className="text-white/80 transition hover:text-white"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="text-white/80 transition hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 bg-gradient-to-b from-[#e69d00]/90 to-[#d99600]/85 backdrop-blur-md px-4 pb-4">
          <button
            onClick={() => setTab('messages')}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === 'messages'
                ? 'bg-white text-[#1a1a1a]'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            Messages
          </button>
          <button
            onClick={() => setTab('articles')}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === 'articles'
                ? 'bg-white text-[#1a1a1a]'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Articles
          </button>
        </div>

        {!minimized && (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#fff9ef]">
            {tab === 'messages' ? (
              <>
                {/* ── Messages area ── */}
                <div
                  ref={messagesContainerRef}
                  data-testid="chat-messages-container"
                  className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#fffdf8]"
                >

                  {/* Proactive insight loading state */}
                  {insightLoading && (
                    <div className="flex justify-start">
                      <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-[#f2f2f0] px-4 py-3 text-sm text-[#1a1a1a]">
                        <div className="flex items-center gap-2 mb-2 text-[0.78rem] font-medium text-[#f0a500]">
                          <Sparkles className="h-3.5 w-3.5" />
                          Analysing your data…
                        </div>
                        <TypingDots />
                      </div>
                    </div>
                  )}

                  {/* Generic welcome message — shown only when no insight is loading/loaded */}
                  {showWelcome && (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-2xl rounded-tl-sm bg-[#f2f2f0] px-5 py-4 text-[0.97rem] leading-relaxed text-[#1a1a1a]">
                        Hi there! 👋 I&apos;m SpokesAI, your account manager assistant.{' '}
                        I can help you understand your dashboard metrics, explain
                        performance trends, and answer digital marketing questions.{' '}
                        What would you like to know?
                      </div>
                      
                      {hasDataset && (
                        <div className="flex justify-start">
                          <button
                            onClick={handleProactiveInsight}
                            className="flex items-center gap-2 rounded-full border border-[#f0a500] px-4 py-2 text-[0.85rem] font-medium text-[#f0a500] hover:bg-[#f0a500]/10 transition-colors"
                          >
                            <Sparkles className="h-4 w-4" />
                            Suggest an Insight
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!hasDataset && showWelcome && (
                    <p className="text-xs text-center text-[#a09e99] mt-1">
                      {datasetsLoading ? 'Loading your reports…' : 'Upload a completed dataset to ask data-specific questions.'}
                    </p>
                  )}

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* Insight badge on the first assistant message */}
                      <div className="flex flex-col gap-1 max-w-[82%]">
                        {msg.role === 'assistant' && messages.indexOf(msg) === 0 && (
                          <span className="flex items-center gap-1 text-[0.72rem] font-medium text-[#f0a500] pl-1">
                            <Sparkles className="h-3 w-3" />
                            Proactive insight
                          </span>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'rounded-tr-sm whitespace-pre-wrap bg-[#f0a500] text-white'
                              : 'rounded-tl-sm bg-[#f2f2f0] text-[#1a1a1a]'
                          }`}
                        >
                          {msg.role === 'assistant' ? renderMessageContent(msg.content) : msg.content}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* User-initiated streaming indicator */}
                  {streaming && (
                    <div className="flex justify-start">
                      <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-[#f2f2f0] px-4 py-3 text-sm text-[#1a1a1a]">
                        {streamingContent ? (
                          renderMessageContent(streamingContent, true)
                        ) : (
                          <TypingDots />
                        )}
                      </div>
                    </div>
                  )}

                  {!streaming && suggestedFollowUps.length > 0 && (
                    <div className="flex justify-start">
                      <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-[#fff6df] px-4 py-3">
                        <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-[#b68000]">
                          SUGGESTED FOLLOW-UPS
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {suggestedFollowUps.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              data-testid="chat-follow-up-chip"
                              onClick={() => void submitMessage(suggestion)}
                              disabled={insightLoading}
                              className="rounded-full border border-[#f0d395] bg-white px-3 py-1.5 text-left text-[0.8rem] font-medium text-[#7a5a00] transition hover:border-[#f0a500] hover:text-[#5e4500] disabled:opacity-60"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <p className="text-xs text-center text-red-500">{error}</p>
                  )}

                  <div ref={bottomRef} />
                </div>

                {/* ── Input bar ── */}
                <div className="border-t border-[#ebebeb] bg-[#fff9ef] px-4 py-3">
                  <form onSubmit={sendMessage} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Support"
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#e0deda] bg-white text-[#7a7775] transition hover:border-[#f0a500] hover:text-[#f0a500]"
                    >
                      <Headphones className="h-4 w-4" />
                    </button>
                    <input
                      data-testid="chat-input"
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={streaming || insightLoading || (datasetsLoading && !hasDataset)}
                      maxLength={500}
                      placeholder={
                        insightLoading
                          ? 'Generating insight…'
                          : datasetsLoading && !hasDataset
                            ? 'Loading reports…'
                            : 'Ask a question…'
                      }
                      className="flex-1 rounded-full border border-[#e0deda] bg-white px-4 py-2 text-sm text-[#1a1a1a] placeholder:text-[#b5b2ae] focus:border-[#f0a500] focus:outline-none focus:ring-2 focus:ring-[#f0a500]/20 disabled:opacity-60"
                    />
                    {streaming ? (
                      <button
                        type="button"
                        onClick={stopStreaming}
                        aria-label="Stop generating"
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 shadow transition hover:bg-red-100 hover:text-red-500"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!input.trim() || insightLoading || (datasetsLoading && !hasDataset)}
                        aria-label="Send message"
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#f0a500] text-white shadow-[0_6px_16px_rgba(240,165,0,0.35)] transition hover:brightness-105 disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                  </form>
                </div>
              </>
            ) : (
              /* ── Articles tab ── */
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-[#a09e99]">
                <BookOpen className="h-10 w-10 opacity-40" />
                <p className="font-medium text-[#4a4845]">No articles yet</p>
                <p className="text-sm leading-relaxed">
                  Help articles and guides will appear here once added.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
