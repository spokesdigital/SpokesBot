'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import { useShallow } from 'zustand/react/shallow'
import { api, streamChat } from '@/lib/api'
import type { Thread, Message, Dataset } from '@/types'
import { mergeServerMessages } from '@/components/dashboard/chatState'
import { EscalationButton } from '@/components/chat/EscalationButton'
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
  Search,
  ChevronDown,
  ChevronRight,
  HelpCircle,
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

type HelpArticle = {
  id: string
  question: string
  answer: string
}

// ── Route → page context string passed to the AI agent ───────────────────────

function getPageContext(pathname: string): string | undefined {
  if (pathname.startsWith('/google-ads')) return 'Google Ads Dashboard'
  if (pathname.startsWith('/meta-ads')) return 'Meta Ads Dashboard'
  if (pathname.startsWith('/dashboard')) return 'Overview Dashboard'
  return undefined
}

const CHART_TAG_REGEX = /<chart>([\s\S]*?)<\/chart>/gi
const DEFAULT_CHART_COLORS = ['#f5b800', '#3b82f6', '#22c55e', '#f97316']

function resolveDatasetId(datasets: Dataset[], activeDatasetId: string | null) {
  if (activeDatasetId) return activeDatasetId
  return datasets.find((dataset) => dataset.status === 'completed')?.id ?? null
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

// ── Thinking indicator ────────────────────────────────────────────────────────

const THINKING_PHASES = [
  'Analyzing your data…',
  'Running calculations…',
  'Checking results…',
  'Almost ready…',
]

function ThinkingIndicator() {
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setPhaseIndex(i => (i + 1) % THINKING_PHASES.length)
        setVisible(true)
      }, 250)
    }, 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="flex items-center gap-2.5">
      {/* Pulsing orb */}
      <span className="relative flex h-3.5 w-3.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f0a500] opacity-50" />
        <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[#f0a500]/30 border border-[#f0a500]/60 items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f0a500]" />
        </span>
      </span>
      {/* Fading phase label */}
      <span
        className="text-xs text-[#8a8480] transition-opacity duration-250"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {THINKING_PHASES[phaseIndex]}
      </span>
    </span>
  )
}

// ── Follow-up suggestion chips ────────────────────────────────────────────────

// Fallback suggestions are shown when the AI response contains no recognisable
// keywords. They must be universally safe — every question here must be
// answerable on any dataset regardless of column names.
const FALLBACK_SUGGESTIONS = [
  'Give me a summary of my data',
  'Which campaign is performing best?',
  'What are the key numbers I should know?',
]

// Each entry in the keyword pools is a simple, safe question that maps to
// one of three operations the agent can ALWAYS perform:
//   • totals  → "What is my total X?"
//   • breakdowns → "Show me X by campaign" / "Which campaign has the most X?"
//   • summary  → "Give me a summary of X"
//
// Intentionally avoided:
//   • "Why is X…" — causal questions the agent cannot answer from data alone
//   • "Compare X vs Y" — fails if either category doesn't exist in the dataset
//   • "Show me X over time" / "trend" — fails if there is no date column
function getSuggestions(response: string): string[] {
  const lower = response.toLowerCase()
  const pool: string[] = []

  if (lower.includes('roas'))
    pool.push('What is my overall ROAS?', 'Show me ROAS by campaign')
  if (lower.includes('revenue') || lower.includes('sales'))
    pool.push('What is my total revenue?', 'Show me revenue by campaign')
  if (lower.includes('ctr') || lower.includes('click-through'))
    pool.push('What is my overall CTR?', 'Which campaign has the best CTR?')
  if (lower.includes('click'))
    pool.push('What is my total click count?', 'Which campaign drives the most clicks?')
  if (lower.includes('cost') || lower.includes('spend'))
    pool.push('What is my total spend?', 'Which campaign spends the most?')
  if (lower.includes('impression'))
    pool.push('What is my total impression count?', 'Which campaign has the most impressions?')
  if (lower.includes('campaign'))
    pool.push('Which campaign is performing best?', 'Show me a breakdown by campaign')
  if (lower.includes('conversion'))
    pool.push('What is my total conversion count?', 'Which campaign drives the most conversions?')
  if (lower.includes('in-store') || lower.includes('delivery'))
    pool.push('What is my total In-Store revenue?', 'What is my total Delivery revenue?')

  const unique = [...new Set(pool)]
  return (unique.length > 0 ? unique : FALLBACK_SUGGESTIONS).slice(0, 3)
}

const PLACEHOLDER_PROMPTS = [
  'What is my total revenue?',
  'Which campaign is performing best?',
  'Give me a data summary',
  'What is my overall ROAS?',
]

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'roas',
    question: 'What is ROAS and why does it matter?',
    answer:
      'ROAS stands for return on ad spend. It shows how much revenue you generate for every dollar spent on advertising, which makes it one of the clearest ways to judge whether campaigns are profitable.',
  },
  {
    id: 'effective-transactions',
    question: 'How are "Effective Transactions" tracked?',
    answer:
      'Effective Transactions represent completed purchases or qualified conversions attributed to your campaigns after platform and attribution rules are applied. They are meant to reflect actions that materially contribute to revenue, not just clicks or visits.',
  },
  {
    id: 'cpc',
    question: 'Why does my CPC fluctuate?',
    answer:
      'CPC is influenced by competitor bidding activity, seasonal demand, ad quality scores, and platform-specific auction dynamics.',
  },
  {
    id: 'revenue-split',
    question: "What's the difference between In-Store and Delivery Revenue?",
    answer:
      'In-Store Revenue captures purchases completed in physical locations, while Delivery Revenue reflects orders fulfilled through delivery channels. Comparing both helps you understand where growth is coming from and which channel mix is changing over time.',
  },
  {
    id: 'refresh-rate',
    question: 'How often is the data updated?',
    answer:
      'Most dashboards refresh on the reporting cadence configured for your connected data sources. In practice, that is usually daily, though some integrations can lag depending on source availability and processing windows.',
  },
  {
    id: 'optimizable-factors',
    question: 'What are "optimizable" vs "market-driven" factors?',
    answer:
      'Optimizable factors are things your team can directly improve, like targeting, creative, budget allocation, and bidding strategy. Market-driven factors come from outside conditions such as competition, seasonality, consumer demand, and channel pricing pressure.',
  },
  {
    id: 'trend-indicators',
    question: 'How do I read the trend indicators on KPI cards?',
    answer:
      'Trend indicators compare current performance against a previous period. Positive movement usually means the metric improved relative to the comparison window, while negative movement highlights a decline that may need investigation.',
  },
  {
    id: 'cpa',
    question: 'What is CPA and how is it calculated?',
    answer:
      'CPA stands for Cost Per Acquisition (or Cost Per Action). It is calculated by dividing your total ad spend by the total number of conversions. It tells you exactly how much it costs to acquire a single customer or lead.',
  },
  {
    id: 'attribution-diff',
    question: 'Why do my numbers look different in Google/Meta Ads vs. my dashboard?',
    answer:
      "This is usually due to different attribution models. Ad platforms often claim credit for a sale if a user simply saw an ad, while your dashboard may use a stricter 'Last Click' or 'Data-Driven' model to show more realistic performance.",
  },
  {
    id: 'google-vs-meta',
    question: 'Why is my ROAS higher on Google than on Meta?',
    answer:
      'Google Search often captures high-intent users looking for specific products, leading to higher ROAS. Meta is typically a discovery platform used for building awareness, which may result in a lower immediate ROAS but drives future search demand.',
  },
  {
    id: 'budget-scaling',
    question: 'When should I increase my daily budget?',
    answer:
      'A good rule of thumb is to scale when a campaign has a stable ROAS that is comfortably above your break-even point for at least 7 days. Increase budgets gradually (10-20% at a time) to avoid throwing the algorithm back into a learning phase.',
  },
  {
    id: 'frequency',
    question: "What does 'Ad Frequency' mean and why should I care?",
    answer:
      'Frequency is the average number of times each person has seen your ad. If your frequency gets too high (typically >3 or 4 for a single campaign), users may experience "ad blindness" or fatigue, causing your performance to drop.',
  },
  {
    id: 'impressions-vs-reach',
    question: 'What is the difference between Impressions and Reach?',
    answer:
      'Impressions are the total number of times your ad was displayed. Reach is the number of unique people who saw it. If 1 person sees your ad 3 times, your Reach is 1 and your Impressions are 3.',
  },
  {
    id: 'creative-fatigue',
    question: 'How do I know if my ads are experiencing creative fatigue?',
    answer:
      'Watch for a rising CPC (Cost Per Click) and a falling CTR (Click-Through Rate) over time. If the same audience is seeing the same ad too often, they stop clicking, which tells the platform the ad is less relevant.',
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatWidget({ open, onClose }: ChatWidgetProps) {
  const { session, user } = useAuth()
  const { organizationId, activeDatasetId, setActiveDataset, activeThreadId, setActiveThread: persistThread } = useDashboardStore(
    useShallow((s) => ({
      organizationId: s.organizationId,
      activeDatasetId: s.activeDatasetId,
      setActiveDataset: s.setActiveDataset,
      activeThreadId: s.activeThreadId,
      setActiveThread: s.setActiveThread,
    }))
  )
  const pathname = usePathname()
  const pageContext = getPageContext(pathname)
  const [promptIndex, setPromptIndex] = useState(0)

  const [isRendered, setIsRendered] = useState(open)
  const [tab, setTab] = useState<'messages' | 'articles'>('messages')
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(false)
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [isThinking, setIsThinking] = useState(false)

  const [minimized, setMinimized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [articleQuery, setArticleQuery] = useState('')
  const [expandedArticleId, setExpandedArticleId] = useState('cpc')

  // Support form state
  const [showSupportForm, setShowSupportForm] = useState(false)
  const [supportEmail, setSupportEmail] = useState('')
  const [supportMessage, setSupportMessage] = useState('')
  const [supportSending, setSupportSending] = useState(false)
  const [supportSent, setSupportSent] = useState(false)
  const [supportError, setSupportError] = useState<string | null>(null)

  // Phase 2: idle escalation — tracks which message ID triggered the idle button.
  // Using a specific message ID (not a generic boolean) ensures the button anchors
  // firmly to the correct bubble even if the user scrolls through a long history.
  const [idleEscalationMessageId, setIdleEscalationMessageId] = useState<string | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)



  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  // AbortController for cancelling in-flight streaming requests
  const abortRef = useRef<AbortController | null>(null)
  // Tracks whether we have already attempted to hydrate this thread ID so we
  // never fire a second request when unrelated state updates re-run the effect.
  const hydratedThreadIdRef = useRef<string | null>(null)
  // Synchronous guard for submitMessage — flips before any await so rapid
  // double-clicks can't both pass the React-state `streaming` check.
  const submittingRef = useRef(false)


  // Abort any in-flight stream on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // ── 45-second idle escalation timer (Phase 2) ──────────────────────────────
  // Fires when the AI finishes streaming and the last message is from the assistant.
  // We capture the specific message ID so the button stays anchored to that bubble.
  // The effect re-runs whenever streaming stops or the message list changes.
  // The cleanup function guarantees the pending timeout is always cancelled before
  // the next effect run or component unmount — no memory leaks possible.
  useEffect(() => {
    // Always cancel any previously pending timer first.
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }

    // Only arm the timer when the AI has finished streaming.
    if (streaming) return

    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') return

    // Don't re-arm if this message already triggered the button.
    if (idleEscalationMessageId === lastMsg.id) return

    const targetId = lastMsg.id
    idleTimerRef.current = setTimeout(() => {
      setIdleEscalationMessageId(targetId)
      idleTimerRef.current = null
    }, 45_000)

    // Cleanup: always clear the timeout when dependencies change or on unmount.
    return () => {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, messages.length])



  // Pre-fill the support email when the form opens, but only if the user
  // hasn't already typed something. Binding the field value directly to
  // `user?.email` means clearing the field snaps it back immediately because
  // the empty string falls through the `||` and restores the default.
  // Using state as the sole source of truth avoids that.
  useEffect(() => {
    if (showSupportForm && !supportEmail && user?.email) {
      setSupportEmail(user.email)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSupportForm])

  // Re-hydrate the last active thread after a page refresh.
  // Fetches the single thread by ID rather than listing all threads.
  // The hydratedThreadIdRef guard ensures exactly one request per thread ID.
  useEffect(() => {
    if (!session || !open || !activeThreadId) return
    if (hydratedThreadIdRef.current === activeThreadId) return
    hydratedThreadIdRef.current = activeThreadId
    api.threads.get(activeThreadId, session.access_token)
      .then(setActiveThread)
      .catch(() => persistThread(null)) // stale or deleted thread — clear from store
  }, [session, open, activeThreadId, persistThread])

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

  const syncMessages = useCallback(async (threadId: string) => {
    if (!session) return
    try {
      const nextMessages = await api.threads.messages(threadId, session.access_token)
      setMessages((prev) => mergeServerMessages(nextMessages, prev))
    } catch {
      // Best-effort sync only.
    }
  }, [session])



  /* ── Load messages when thread changes ── */
  useEffect(() => {
    if (!session || !activeThread) return
    void syncMessages(activeThread.id)
  }, [session, activeThread, syncMessages])

  /* ── Scroll to bottom ── */
  useEffect(() => {
    scrollToBottom('smooth')
  }, [messages.length])

  useEffect(() => {
    if (!streaming && !streamingContent) return
    const frame = window.requestAnimationFrame(() => scrollToBottom('auto'))
    return () => window.cancelAnimationFrame(frame)
  }, [streaming, streamingContent])



  useEffect(() => {
    if (open) {
      setIsRendered(true)
      return
    }

    const timeoutId = window.setTimeout(() => setIsRendered(false), 320)
    return () => window.clearTimeout(timeoutId)
  }, [open])

  useEffect(() => {
    if (!open) return
    const interval = window.setInterval(() => {
      setPromptIndex((prev) => (prev + 1) % PLACEHOLDER_PROMPTS.length)
    }, 3000)
    return () => window.clearInterval(interval)
  }, [open])

  /* ── Send message ── */
  async function submitMessage(rawMessage: string) {
    if (!session || !rawMessage.trim() || streaming || submittingRef.current) return
    submittingRef.current = true

    const userMessage = rawMessage.trim().slice(0, 500)
    const currentDatasetId = resolveDatasetId(datasets, activeDatasetId)

    // Show the user's message immediately so the UI feels instant.
    const tempId = `temp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      thread_id: activeThread?.id ?? '',
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    }
    setInput('')
    setSuggestions([])
    setError(null)
    setMessages((prev) => [...prev, optimistic])

    let thread = activeThread
    if (!thread) {
      let datasetId = currentDatasetId
      if (!datasetId) {
        const refreshedDatasets = await loadDatasets()
        datasetId = resolveDatasetId(refreshedDatasets, useDashboardStore.getState().activeDatasetId)
      }
      if (!datasetId) {
        setError(datasetsLoading ? 'Loading your reports… please try again in a moment.' : 'Please upload a completed dataset first.')
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        submittingRef.current = false
        return
      }
      try {
        thread = await api.threads.create(
          { dataset_id: datasetId, title: userMessage.slice(0, 60) },
          session.access_token,
          user?.role === 'admin' ? organizationId ?? undefined : undefined,
        )
        setActiveThread(thread)
        persistThread(thread.id)
        // Patch the optimistic message with the real thread_id so mergeServerMessages can dedup it.
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, thread_id: thread!.id } : m))
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to create conversation.')
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        submittingRef.current = false
        return
      }
    }

    setStreaming(true)
    setStreamingContent('')
    setIsThinking(true)

    // Create a fresh AbortController for this request.
    // A 90-second hard timeout prevents the UI from hanging if the backend stalls.
    const controller = new AbortController()
    const streamTimeout = setTimeout(() => controller.abort(), 90_000)
    abortRef.current = controller

    let accumulated = ''
    let streamRequiresEscalation = false
    try {
      for await (const chunk of streamChat(thread.id, userMessage, session.access_token, controller.signal, pageContext)) {
        if (chunk.error) throw new Error(chunk.error)
        if (chunk.done) {
          if (chunk.requires_escalation) streamRequiresEscalation = true
          break
        }
        if (chunk.status) continue  // thinking heartbeat — indicator handles its own animation
        if (chunk.token) {
          if (isThinking) setIsThinking(false)  // first real token — exit thinking phase
          accumulated += chunk.token
          setStreamingContent(accumulated)
        }
      }
      // Do NOT add a local copy — wait for the server-persisted version.
      // Retry a few times in case the backend hasn't committed yet.
      if (accumulated) setSuggestions(getSuggestions(accumulated))

      // Short retry loop: backend can take up to ~500ms to persist the assistant message.
      let synced = false
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 250))
        try {
          const nextMessages = await api.threads.messages(thread.id, session.access_token)
          const hasAssistantReply = nextMessages.some(
            (m) => m.role === 'assistant' && m.content === accumulated,
          )
          if (hasAssistantReply || attempt === 3) {
            // Clear the streaming bubble atomically with the server message arriving.
            // React 18 batches all three setState calls into one render, so the user
            // never sees the server copy and the streaming copy simultaneously.
            setStreamingContent('')
            setStreaming(false)
            setIsThinking(false)
            setMessages((prev) => mergeServerMessages(nextMessages, prev.filter(
              // drop the optimistic user message only — keep nothing with a local id
              (m) => !m.id.startsWith('stream-'),
            )))
            synced = true
            break
          }
        } catch {
          // best-effort
        }
      }
      if (!synced) await syncMessages(thread.id)


    } catch (e: unknown) {
      // Ignore abort errors — user intentionally cancelled
      if (e instanceof Error && e.name !== 'AbortError') {
        setError(e.message)
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            thread_id: thread!.id,
            role: 'assistant',
            content: 'I ran into an error while answering that. Please try again.',
            created_at: new Date().toISOString(),
          },
        ])
        await syncMessages(thread.id)
      }
    } finally {
      clearTimeout(streamTimeout)
      setStreamingContent('')
      setStreaming(false)
      setIsThinking(false)
      submittingRef.current = false
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
    persistThread(null)
    setMessages([])
    setStreamingContent('')
    setSuggestions([])
    setError(null)
  }

  if (!isRendered) return null

  const resolvedDatasetId = resolveDatasetId(datasets, activeDatasetId)
  const hasDataset = Boolean(resolvedDatasetId)
  const filteredArticles = HELP_ARTICLES.filter((article) => {
    const query = articleQuery.trim().toLowerCase()
    if (!query) return true
    return (
      article.question.toLowerCase().includes(query) ||
      article.answer.toLowerCase().includes(query)
    )
  })

  // Show welcome message only when there are no messages AND we're not fetching an insight
  const showWelcome = messages.length === 0 && !streaming

  // Index of the last assistant message — used to decide where to attach the escalation button
  const lastAssistantIndex = messages.reduceRight(
    (found, msg, i) => (found !== -1 ? found : msg.role === 'assistant' ? i : -1),
    -1,
  )


  return (
    /* Fixed overlay — bottom-right, above the FAB */
    <div
      data-testid="chat-widget"
      className={`chat-widget-bottom fixed right-2 z-50 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:right-7 ${
        open
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-5 scale-[0.96] opacity-0'
      }`}
      style={{ width: 'min(380px, calc(100vw - 2rem))' }}
    >
      {/* Panel */}
      <div
        className="flex flex-col overflow-hidden rounded-[1.6rem] shadow-[0_32px_80px_rgba(0,0,0,0.18)] transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ height: minimized ? 'auto' : 'min(520px, calc(100dvh - 10rem - env(safe-area-inset-bottom, 0px)))' }}
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
                  className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#fffdf8] relative"
                >

                  {/* ── Support form overlay ── */}
                  {showSupportForm && (
                    <div className="absolute inset-0 z-20 flex items-start justify-center bg-[#fffdf8]/95 backdrop-blur-sm px-4 pt-6">
                      <div className="w-full max-w-sm">
                        {supportSent ? (
                          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.08)] border border-[#e8e1d7]">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                              <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <p className="text-sm font-semibold text-[#1a1a1a]">Message sent!</p>
                            <p className="text-xs text-[#7a7775] text-center">Our team will get back to you soon.</p>
                            <button
                              type="button"
                              onClick={() => { setShowSupportForm(false); setSupportSent(false) }}
                              className="mt-2 rounded-full bg-[#f0a500] px-5 py-2 text-sm font-medium text-white shadow-[0_6px_16px_rgba(240,165,0,0.35)] transition hover:brightness-105"
                            >
                              Back to Chat
                            </button>
                          </div>
                        ) : (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault()
                              if (!session || !supportMessage.trim()) return
                              setSupportSending(true)
                              setSupportError(null)
                              try {
                                await api.support.send(
                                  { email: supportEmail, message: supportMessage.trim() },
                                  session.access_token,
                                )
                                setSupportSent(true)
                                setSupportMessage('')
                              } catch (err: unknown) {
                                setSupportError(err instanceof Error ? err.message : 'Failed to send message.')
                              } finally {
                                setSupportSending(false)
                              }
                            }}
                            className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.08)] border border-[#e8e1d7]"
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold text-[#1a1a1a]">Contact Support</h3>
                              <button
                                type="button"
                                onClick={() => setShowSupportForm(false)}
                                aria-label="Close support form"
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[#7a7775] transition hover:bg-[#f2f2f0] hover:text-[#1a1a1a]"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <input
                              type="email"
                              placeholder="Your email address"
                              value={supportEmail}
                              onChange={(e) => setSupportEmail(e.target.value)}
                              required
                              className="rounded-xl border border-[#e0deda] bg-[#faf9f7] px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b5b2ae] focus:border-[#f0a500] focus:outline-none focus:ring-2 focus:ring-[#f0a500]/20"
                            />
                            <textarea
                              placeholder="Describe your question..."
                              value={supportMessage}
                              onChange={(e) => setSupportMessage(e.target.value)}
                              required
                              maxLength={2000}
                              rows={4}
                              className="resize-none rounded-xl border border-[#e0deda] bg-[#faf9f7] px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b5b2ae] focus:border-[#f0a500] focus:outline-none focus:ring-2 focus:ring-[#f0a500]/20"
                            />
                            {supportError && (
                              <p className="text-xs text-red-500">{supportError}</p>
                            )}
                            <button
                              type="submit"
                              disabled={supportSending || !supportMessage.trim()}
                              className="w-full rounded-xl bg-gradient-to-r from-[#f9c51b] to-[#e69d00] py-2.5 text-sm font-semibold text-[#1a1a1a] shadow-[0_10px_24px_rgba(240,165,0,0.28)] transition-all hover:brightness-105 disabled:opacity-50"
                            >
                              {supportSending ? 'Sending...' : 'Send Message'}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )}



                  {/* Generic welcome message */}
                  {showWelcome && (
                    <div className="flex flex-col gap-4">
                      <div className="rounded-2xl rounded-tl-sm bg-[#f2f2f0] px-5 py-4 text-[0.97rem] leading-relaxed text-[#1a1a1a]">
                        {!hasDataset && !datasetsLoading
                          ? "Hi there! I'm SpokesAI. I am currently waiting for your account manager to upload your data. Check back soon!"
                          : <>Hi there! 👋 I&apos;m SpokesAI, your account manager assistant.{' '}Ask me anything about your data — revenue, trends, campaigns, and more!</>
                        }
                      </div>
                    </div>
                  )}

                  {messages.map((msg, index) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* Insight badge on the first assistant message */}
                      <div className="flex flex-col gap-1 max-w-[82%] min-w-0">
                        {msg.role === 'assistant' && index === 0 && !msg.id.startsWith('stream-') && (
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
                        {/* Escalation button — shown when:
                            (a) message.metadata.requires_escalation = true (AI fallback, Phase 1), OR
                            (b) this message is the idle-escalation target (45s inactivity, Phase 2) */}
                        {msg.role === 'assistant' && (msg.metadata?.requires_escalation || msg.id === idleEscalationMessageId) && (
                          <EscalationButton
                            threadId={activeThread?.id ?? ''}
                            token={session?.access_token ?? ''}
                            fadeIn={!msg.metadata?.requires_escalation && msg.id === idleEscalationMessageId}
                          />
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Thinking / streaming bubble */}
                  {streaming && (
                    <div className="flex justify-start">
                      <div className={`max-w-[82%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#1a1a1a] transition-colors duration-300 ${
                        isThinking ? 'bg-[#fdf8ee] border border-[#f0a500]/20' : 'bg-[#f2f2f0]'
                      }`}>
                        {streamingContent ? (
                          streamingContent.includes('<chart>')
                            ? renderMessageContent(streamingContent, true)
                            : <span className="whitespace-pre-wrap leading-relaxed">{streamingContent}</span>
                        ) : (
                          <ThinkingIndicator />
                        )}
                      </div>
                    </div>
                  )}



                  {/* ── Follow-up suggestion chips ── */}
                  {suggestions.length > 0 && !streaming && (
                    <div className="flex flex-wrap gap-2 pt-1 pb-2">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => { setSuggestions([]); void submitMessage(s) }}
                          className="rounded-full border border-[#e0deda] bg-white px-3 py-1.5 text-xs text-[#4a4540] shadow-sm transition hover:border-[#f0a500] hover:text-[#f0a500]"
                        >
                          {s}
                        </button>
                      ))}
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
                      onClick={() => { setShowSupportForm((v) => !v); setSupportSent(false); setSupportError(null) }}
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition ${
                        showSupportForm
                          ? 'border-[#f0a500] bg-[#f0a500]/10 text-[#f0a500]'
                          : 'border-[#e0deda] bg-white text-[#7a7775] hover:border-[#f0a500] hover:text-[#f0a500]'
                      }`}
                    >
                      <Headphones className="h-4 w-4" />
                    </button>
                    <div className="relative flex-1 rounded-full bg-white shadow-[0_10px_24px_rgba(240,165,0,0.08)]">
                      <input
                        data-testid="chat-input"
                        type="text"
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value)
                          if (error) setError(null)
                          // Any typing resets the idle timer — the button should only appear
                          // when the user is truly idle, not while they are composing a reply.
                          if (idleTimerRef.current !== null) {
                            clearTimeout(idleTimerRef.current)
                            idleTimerRef.current = null
                          }
                          setIdleEscalationMessageId(null)
                        }}
                        disabled={streaming || datasetsLoading || !hasDataset}
                        maxLength={500}
                        placeholder={
                          datasetsLoading
                            ? 'Loading reports…'
                            : !hasDataset
                            ? 'Waiting for data upload…'
                            : ''
                        }
                        className="relative z-10 w-full rounded-full border border-[#e0deda] bg-transparent px-4 py-2 text-sm text-[#1a1a1a] placeholder:text-[#b5b2ae] focus:border-[#f0a500] focus:outline-none focus:ring-2 focus:ring-[#f0a500]/20 disabled:opacity-60"
                      />
                      {!input && hasDataset && !datasetsLoading && !streaming && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
                          <div className="absolute inset-[3px] rounded-full bg-[linear-gradient(90deg,rgba(255,246,221,0.95),rgba(255,255,255,0.7),rgba(255,240,201,0.95))]" />
                          <div className="absolute left-3 top-1/2 h-7 w-24 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(240,165,0,0.24),rgba(240,165,0,0))] blur-md" />
                          <div className="relative flex h-full items-center px-4">
                            {PLACEHOLDER_PROMPTS.map((prompt, i) => (
                              <span
                                key={prompt}
                                className={`absolute inset-y-0 left-4 right-4 flex items-center gap-2 text-sm font-medium tracking-[0.01em] transition-all duration-700 ease-out ${
                                  i === promptIndex
                                    ? 'translate-y-0 opacity-100 blur-0'
                                    : 'translate-y-1 opacity-0 blur-[1px]'
                                }`}
                              >
                                <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-[#f0a500] drop-shadow-[0_0_8px_rgba(240,165,0,0.45)]" />
                                <span className="truncate bg-[linear-gradient(90deg,#9a6500,#f0a500,#b87900)] bg-clip-text text-transparent [text-shadow:0_0_14px_rgba(240,165,0,0.16)]">
                                  Try asking: &quot;{prompt}&quot;
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
                        disabled={!input.trim() || datasetsLoading || !hasDataset}
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
              <div className="flex flex-1 flex-col overflow-hidden bg-[#fffdf8]">
                <div className="border-b border-[#efe7db] bg-[#fff9ef] px-4 py-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8f98a8]" />
                    <input
                      type="text"
                      value={articleQuery}
                      onChange={(e) => setArticleQuery(e.target.value)}
                      placeholder="Search help center..."
                      className="w-full rounded-2xl border border-[#e7dfd3] bg-white py-2.5 pl-11 pr-4 text-sm text-[#1a1a1a] placeholder:text-[#8f98a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:border-[#f0a500] focus:outline-none focus:ring-2 focus:ring-[#f0a500]/15"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="mb-3 flex items-center gap-2 text-[0.92rem] font-semibold uppercase tracking-[0.06em] text-[#7d7a75]">
                    <HelpCircle className="h-4 w-4 text-[#e1af28]" />
                    FAQs
                  </div>

                  <div className="overflow-hidden rounded-[1.4rem] border border-[#ece4d8] bg-white shadow-[0_18px_40px_rgba(234,201,135,0.12)]">
                    {filteredArticles.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <p className="text-sm font-medium text-[#4a4845]">No matching FAQs</p>
                        <p className="mt-2 text-sm leading-relaxed text-[#8b8882]">
                          Try searching for a metric like ROAS, CPC, revenue, or trends.
                        </p>
                      </div>
                    ) : (
                      filteredArticles.map((article, index) => {
                        const isExpanded = expandedArticleId === article.id

                        return (
                          <div
                            key={article.id}
                            className={`${index !== 0 ? 'border-t border-[#efe7db]' : ''} ${
                              isExpanded ? 'bg-[#fffefe]' : 'bg-white'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedArticleId(isExpanded ? '' : article.id)}
                              className={`flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition ${
                                isExpanded ? 'bg-[#fffaf0] shadow-[inset_0_0_0_1.5px_#efc14d]' : 'hover:bg-[#fffaf2]'
                              }`}
                              aria-expanded={isExpanded}
                            >
                              <span className="pr-2 text-[0.98rem] font-medium leading-snug text-[#242220]">
                                {article.question}
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#6d7482]" />
                              ) : (
                                <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#6d7482]" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="border-t border-[#f5e4b7] bg-[#fffdf7] px-4 pb-4 pt-2 shadow-[inset_0_0_0_1.5px_#efc14d]">
                                <p className="max-w-[95%] text-[0.95rem] leading-7 text-[#7a8393]">
                                  {article.answer}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
