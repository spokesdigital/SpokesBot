'use client'

import { Loader2 } from 'lucide-react'

interface TimeoutScreenProps {
  channelName: string
}

export function TimeoutScreen({ channelName }: TimeoutScreenProps) {
  return (
    <div className="flex min-h-[480px] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative w-full max-w-md rounded-[2rem] border border-[#e8e1d7] bg-white/70 px-10 py-12 shadow-[0_8px_40px_rgba(240,165,0,0.08)] backdrop-blur-sm">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,211,84,0.18)_0%,transparent_65%)]" />

        {/* Icon */}
        <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#f0e4c0] bg-[radial-gradient(circle_at_30%_28%,#ffe48a_0%,#f9c51b_38%,#ecab00_100%)] shadow-[0_8px_24px_rgba(240,165,0,0.32)]">
          <span className="pointer-events-none absolute inset-[2px] rounded-[calc(1rem-2px)] bg-[radial-gradient(circle_at_28%_26%,rgba(255,255,255,0.72),rgba(255,255,255,0.12)_34%,transparent_52%)]" />
          <Loader2 className="relative h-8 w-8 text-[#1f2530] animate-spin" />
        </div>

        {/* Copy */}
        <h2 className="relative mb-3 text-2xl font-bold tracking-tight text-[#1d2129]">
          Getting your {channelName} report ready
        </h2>
        <p className="relative text-sm leading-relaxed text-[#6b7280]">
          Your account manager has your data connected. We&apos;re pulling it in now — this usually takes just a few seconds.
        </p>

        {/* Animated dots */}
        <div className="relative mt-8 flex items-center justify-center gap-2">
          <span
            className="h-2 w-2 rounded-full bg-[#f9c51b]"
            style={{ animation: 'bounce 1.2s infinite', animationDelay: '0ms' }}
          />
          <span
            className="h-2 w-2 rounded-full bg-[#f9c51b]/60"
            style={{ animation: 'bounce 1.2s infinite', animationDelay: '200ms' }}
          />
          <span
            className="h-2 w-2 rounded-full bg-[#f9c51b]/30"
            style={{ animation: 'bounce 1.2s infinite', animationDelay: '400ms' }}
          />
        </div>

        <p className="relative mt-5 text-xs text-[#a89d8c]">Retrying automatically…</p>
      </div>
    </div>
  )
}
