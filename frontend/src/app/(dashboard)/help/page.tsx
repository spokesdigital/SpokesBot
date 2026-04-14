'use client'

import { HelpCircle, Mail, MessageCircleQuestion } from 'lucide-react'

const faqs = [
  {
    question: 'How do I change the reporting period?',
    answer: 'Use the date selector in the top-right corner of the overview page to switch between common reporting windows like Last 7 Days or Last 30 Days.',
  },
  {
    question: 'What do the KPI cards represent?',
    answer: 'The overview cards summarize the best-available performance fields from your connected dataset, such as spend, revenue, CTR, and ROAS when those columns are present.',
  },
  {
    question: 'Why might some cards show missing values?',
    answer: 'Some dashboards depend on dataset columns like impressions, clicks, revenue, cost, and a usable date field. When those fields are absent, the UI keeps the card structure but cannot compute the metric yet.',
  },
]

export default function HelpPage() {
  return (
    <div className="min-h-full bg-[#fcfaf7]">
      <div className="border-b border-[#e7e1d6] bg-white px-4 py-5 sm:px-6 md:px-8 md:py-6">
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[#252b36]">Help / FAQs</h1>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8">
        <div>
          <h2 className="text-[2.45rem] font-semibold tracking-[-0.05em] text-[#252b36]">
            Need a hand?
          </h2>
          <p className="mt-2 text-[1.02rem] text-[#727b8d]">
            Quick answers for common questions about your overview dashboard.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {faqs.map((faq) => (
            <article
              key={faq.question}
              className="rounded-[1.6rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f8f1df] text-[#c48d00]">
                <HelpCircle className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-[1.1rem] font-semibold text-[#252b36]">{faq.question}</h3>
              <p className="mt-3 text-[0.96rem] leading-7 text-[#6f7788]">{faq.answer}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[1.6rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3 text-[#252b36]">
              <MessageCircleQuestion className="h-5 w-5 text-[#c48d00]" />
              <h3 className="text-[1.05rem] font-semibold">Still need help?</h3>
            </div>
            <p className="mt-3 text-[0.96rem] leading-7 text-[#6f7788]">
              Use the floating chat button to ask questions about your data, performance trends, or what a metric means inside the dashboard.
            </p>
          </div>

          <div className="rounded-[1.6rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3 text-[#252b36]">
              <Mail className="h-5 w-5 text-[#c48d00]" />
              <h3 className="text-[1.05rem] font-semibold">Support planning</h3>
            </div>
            <p className="mt-3 text-[0.96rem] leading-7 text-[#6f7788]">
              A dedicated support workflow and richer knowledge base are not wired up yet. This page gives clients a stable destination until we connect live support content.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
