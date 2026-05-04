'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastVariant = 'success' | 'error'

interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  /** Show a success toast */
  success: (message: string) => void
  /** Show an error toast */
  error: (message: string) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const add = useCallback((message: string, variant: ToastVariant) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((prev) => [...prev, { id, message, variant }])
  }, [])

  const value: ToastContextValue = {
    success: useCallback((m) => add(m, 'success'), [add]),
    error: useCallback((m) => add(m, 'error'), [add]),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Portal — fixed top-right, above everything */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 top-4 left-4 sm:left-auto z-[200] flex flex-col items-end gap-2"
      >
        {toasts.map((t) => (
          <ToastBubble key={t.id} toast={t} onDismiss={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ── Individual toast bubble ───────────────────────────────────────────────────

function ToastBubble({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss: (id: string) => void
}) {
  // Two-frame enter animation (opacity + translateY)
  const [visible, setVisible] = useState(false)
  const dismissRef = useRef(onDismiss)

  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    // Allow paint before animating in
    const enterFrame = requestAnimationFrame(() => setVisible(true))

    // Auto-dismiss: fade out first, then remove from DOM
    const fadeTimer = window.setTimeout(() => setVisible(false), 3200)
    const removeTimer = window.setTimeout(() => dismissRef.current(toast.id), 3500)

    return () => {
      cancelAnimationFrame(enterFrame)
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [toast.id])

  function handleDismiss() {
    setVisible(false)
    setTimeout(() => onDismiss(toast.id), 300)
  }

  const isSuccess = toast.variant === 'success'

  return (
    <div
      role="status"
      className={[
        'pointer-events-auto flex min-w-[min(260px,calc(100vw-2rem))] max-w-[min(360px,calc(100vw-2rem))] items-start gap-3 rounded-[1rem] border px-4 py-3',
        'shadow-[0_8px_28px_rgba(15,23,42,0.13)] backdrop-blur-sm',
        'transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-[-6px] opacity-0',
        isSuccess
          ? 'border-[#f3e6a8] bg-white text-[#7a5c00]'
          : 'border-red-200 bg-white text-red-700',
      ].join(' ')}
    >
      {/* Icon */}
      <span className="mt-px flex-shrink-0">
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4 text-[#d99600]" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-500" />
        )}
      </span>

      {/* Message */}
      <p className="flex-1 text-sm font-medium leading-5">{toast.message}</p>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="mt-px flex-shrink-0 rounded-md p-0.5 opacity-50 transition hover:opacity-90"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
