'use client'

import { useEffect, useState } from 'react'
import { HelpCircle, Mail, Search, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { HelpArticle } from '@/types'

export default function HelpPage() {
  const [articles, setArticles] = useState<HelpArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    api.help.listPublished()
      .then(setArticles)
      .catch(() => setArticles([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = query.trim()
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(query.toLowerCase()) ||
          a.body.toLowerCase().includes(query.toLowerCase()),
      )
    : articles

  // Group by category
  const grouped = filtered.reduce<Record<string, HelpArticle[]>>((acc, a) => {
    const key = a.category || 'general'
    ;(acc[key] ??= []).push(a)
    return acc
  }, {})

  const categoryLabel = (cat: string) =>
    cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="min-h-full bg-[#fcfaf7]">
      <div className="border-b border-[#e7e1d6] bg-white px-4 py-5 sm:px-6 md:px-8 md:py-6">
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[#252b36]">Help / FAQs</h1>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[2.45rem] font-semibold tracking-[-0.05em] text-[#252b36]">
              Need a hand?
            </h2>
            <p className="mt-2 text-[1.02rem] text-[#727b8d]">
              Quick answers for common questions about your dashboard.
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles…"
              className="w-full rounded-xl border border-[#e8e1d7] bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-[#c48d00]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <HelpCircle className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">
              {query ? `No articles match "${query}"` : 'No help articles published yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([category, items]) => (
              <section key={category}>
                {Object.keys(grouped).length > 1 && (
                  <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#c48d00]">
                    {categoryLabel(category)}
                  </h3>
                )}
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((article) => (
                    <article
                      key={article.id}
                      className="rounded-[1.6rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f8f1df] text-[#c48d00]">
                        <HelpCircle className="h-5 w-5" />
                      </div>
                      <h3 className="mt-5 text-[1.1rem] font-semibold text-[#252b36]">
                        {article.title}
                      </h3>
                      <p className="mt-3 text-[0.96rem] leading-7 text-[#6f7788]">{article.body}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[1.6rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3 text-[#252b36]">
              <HelpCircle className="h-5 w-5 text-[#c48d00]" />
              <h3 className="text-[1.05rem] font-semibold">Still need help?</h3>
            </div>
            <p className="mt-3 text-[0.96rem] leading-7 text-[#6f7788]">
              Use the floating chat button to ask questions about your data, performance trends, or what a metric means inside the dashboard.
            </p>
          </div>

          <div className="rounded-[1.6rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3 text-[#252b36]">
              <Mail className="h-5 w-5 text-[#c48d00]" />
              <h3 className="text-[1.05rem] font-semibold">Contact support</h3>
            </div>
            <p className="mt-3 text-[0.96rem] leading-7 text-[#6f7788]">
              Can&apos;t find what you need? Send a message to the Spokes Digital team and we&apos;ll get back to you promptly.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
