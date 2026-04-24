'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { HelpArticle } from '@/types'
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Save,
  X,
  BookOpen,
} from 'lucide-react'

const CATEGORIES = ['general', 'getting_started', 'dashboards', 'ai_assistant', 'data_uploads', 'troubleshooting']

const categoryLabel = (cat: string) =>
  cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

type FormState = {
  title: string
  body: string
  category: string
  sort_order: number
  is_published: boolean
}

const BLANK: FormState = {
  title: '',
  body: '',
  category: 'general',
  sort_order: 0,
  is_published: true,
}

export default function AdminHelpPage() {
  const { session } = useAuth()
  const [articles, setArticles] = useState<HelpArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // editing = null → closed; editing = 'new' → new; editing = id → edit existing
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)

  async function refresh() {
    if (!session) return
    try {
      const data = await api.help.listAll(session.access_token)
      setArticles(data)
    } catch {
      setError('Failed to load articles.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [session])  // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setForm(BLANK)
    setEditing('new')
    setError(null)
  }

  function openEdit(article: HelpArticle) {
    setForm({
      title: article.title,
      body: article.body,
      category: article.category,
      sort_order: article.sort_order,
      is_published: article.is_published,
    })
    setEditing(article.id)
    setError(null)
  }

  function closeEditor() {
    setEditing(null)
    setForm(BLANK)
    setError(null)
  }

  async function handleSave() {
    if (!session || !form.title.trim() || !form.body.trim()) {
      setError('Title and body are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editing === 'new') {
        await api.help.create(form, session.access_token)
      } else if (editing) {
        await api.help.update(editing, form, session.access_token)
      }
      closeEditor()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePublish(article: HelpArticle) {
    if (!session) return
    try {
      await api.help.update(article.id, { is_published: !article.is_published }, session.access_token)
      await refresh()
    } catch { /* silent */ }
  }

  async function handleDelete(article: HelpArticle) {
    if (!session || !confirm(`Delete "${article.title}"? This cannot be undone.`)) return
    try {
      await api.help.delete(article.id, session.access_token)
      await refresh()
    } catch { /* silent */ }
  }

  const grouped = articles.reduce<Record<string, HelpArticle[]>>((acc, a) => {
    const key = a.category || 'general'
    ;(acc[key] ??= []).push(a)
    return acc
  }, {})

  return (
    <div className="space-y-8 px-4 py-5 sm:px-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Help Articles</h1>
          <p className="mt-1 text-sm text-slate-500">Manage the knowledge base shown to clients on the Help page</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-[#f0a500] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d99600]"
        >
          <Plus className="h-4 w-4" />
          New Article
        </button>
      </div>

      {/* Editor panel */}
      {editing !== null && (
        <div className="glass-panel rounded-[1.75rem] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">
              {editing === 'new' ? 'New Article' : 'Edit Article'}
            </h2>
            <button onClick={closeEditor} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g. How do I change the reporting period?"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">Body</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))}
                rows={5}
                placeholder="Answer the question clearly and concisely…"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20 resize-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">Sort Order</label>
              <input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => setForm((s) => ({ ...s, sort_order: Number(e.target.value) }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                id="is_published"
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm((s) => ({ ...s, is_published: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-[#f0a500] focus:ring-[#f0a500]"
              />
              <label htmlFor="is_published" className="text-sm text-slate-700">
                Published (visible to clients)
              </label>
            </div>
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}

          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={closeEditor}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-[#f0a500] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#d99600] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Article'}
            </button>
          </div>
        </div>
      )}

      {/* Articles list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-[#f0a500]" />
        </div>
      ) : articles.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center rounded-[1.75rem] py-20 text-slate-400">
          <BookOpen className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">No articles yet. Click &quot;New Article&quot; to add the first one.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="glass-panel overflow-hidden rounded-[1.75rem]">
              <div className="border-b border-white/60 px-6 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-[#c48d00]">
                  {categoryLabel(category)}
                </h2>
              </div>
              <div className="divide-y divide-white/40">
                {items.map((article) => (
                  <div key={article.id} className="flex items-start gap-4 px-6 py-4 transition hover:bg-white/40">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 truncate">{article.title}</p>
                        {!article.is_published && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            Draft
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{article.body}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => handleTogglePublish(article)}
                        title={article.is_published ? 'Unpublish' : 'Publish'}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        {article.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => openEdit(article)}
                        title="Edit"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-[#d99600]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(article)}
                        title="Delete"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
