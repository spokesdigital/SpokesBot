'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase'
import { User, Lock, Settings, RefreshCw, Check } from 'lucide-react'

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-[#f0a500]' : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

const PREF_KEYS = {
  emailNotifications: 'admin_pref_email_notifications',
  autoGenerateReports: 'admin_pref_auto_generate_reports',
}

function readPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const val = localStorage.getItem(key)
  return val === null ? fallback : val === 'true'
}

function savePref(key: string, value: boolean) {
  localStorage.setItem(key, String(value))
}

export default function SettingsPage() {
  const { user, session } = useAuth()
  const supabase = createClient()
  const supabaseRef = useRef(supabase)

  // ── Profile ───────────────────────────────────────────────────────────────
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // ── Password ──────────────────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  // ── Preferences ───────────────────────────────────────────────────────────
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [autoGenerateReports, setAutoGenerateReports] = useState(true)

  useEffect(() => {
    if (user) {
      setProfileEmail(user.email ?? '')
      const savedName = session?.user.user_metadata?.full_name as string | undefined
      setProfileName(savedName || user.email?.split('@')[0] || 'Admin User')
    }
    setEmailNotifications(readPref(PREF_KEYS.emailNotifications, true))
    setAutoGenerateReports(readPref(PREF_KEYS.autoGenerateReports, true))
  }, [user])

  // ── Save profile ──────────────────────────────────────────────────────────
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)
    const emailChanged = profileEmail.trim() !== (user?.email ?? '')
    try {
      const { error } = await supabaseRef.current.auth.updateUser({
        ...(emailChanged ? { email: profileEmail.trim() } : {}),
        data: { full_name: profileName.trim() },
      })
      if (error) throw error
      setProfileMsg({
        text: emailChanged
          ? 'Confirmation email sent — check your inbox to confirm the new address.'
          : 'Profile saved successfully.',
        ok: true,
      })
      setTimeout(() => setProfileMsg(null), 5000)
    } catch (e) {
      setProfileMsg({ text: e instanceof Error ? e.message : 'Failed to save profile.', ok: false })
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Update password ───────────────────────────────────────────────────────
  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)
    if (!currentPw) { setPwError('Enter your current password.'); return }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    setSavingPw(true)
    try {
      // Re-authenticate with the current password first to verify it
      const { error: signInError } = await supabaseRef.current.auth.signInWithPassword({
        email: user!.email!,
        password: currentPw,
      })
      if (signInError) throw new Error('Current password is incorrect.')

      const { error } = await supabaseRef.current.auth.updateUser({ password: newPw })
      if (error) throw error
      setPwSuccess(true)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setTimeout(() => setPwSuccess(false), 3000)
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Failed to update password.')
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 md:px-8 md:py-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Admin Profile */}
        <div className="glass-panel rounded-[1.75rem] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
              <User className="h-5 w-5 text-[#d99600]" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Admin Profile</h2>
          </div>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Name</label>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={profileEmail}
                onChange={e => setProfileEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              />
            </div>
            {profileMsg && (
              <p className={`flex items-start gap-1.5 text-xs font-medium ${profileMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                {profileMsg.ok && <Check className="mt-px h-3.5 w-3.5 shrink-0" />}
                {profileMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={savingProfile}
              className="flex items-center gap-2 rounded-xl bg-[#f0a500] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d99600] disabled:opacity-60"
            >
              {savingProfile && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="glass-panel rounded-[1.75rem] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
              <Lock className="h-5 w-5 text-[#d99600]" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Change Password</h2>
          </div>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Current Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm New Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              />
            </div>
            {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            {pwSuccess && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Password updated successfully.
              </p>
            )}
            <button
              type="submit"
              disabled={savingPw || !newPw || !currentPw}
              className="flex items-center gap-2 rounded-xl bg-[#f0a500] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d99600] disabled:opacity-60"
            >
              {savingPw && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Update Password
            </button>
          </form>
        </div>
      </div>

      {/* System Preferences */}
      <div className="glass-panel rounded-[1.75rem] p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
            <Settings className="h-5 w-5 text-[#d99600]" />
          </div>
          <h2 className="text-base font-semibold text-slate-800">System Preferences</h2>
        </div>
        <div className="divide-y divide-white/50">
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Email Notifications</p>
              <p className="text-xs text-slate-500">Receive alerts for failed uploads and new reports</p>
            </div>
            <Toggle
              checked={emailNotifications}
              onChange={v => { setEmailNotifications(v); savePref(PREF_KEYS.emailNotifications, v) }}
            />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Auto-generate Reports</p>
              <p className="text-xs text-slate-500">Automatically generate weekly reports for active clients</p>
            </div>
            <Toggle
              checked={autoGenerateReports}
              onChange={v => { setAutoGenerateReports(v); savePref(PREF_KEYS.autoGenerateReports, v) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
