'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import {
  Users,
  Database,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bot,
} from 'lucide-react'

const navItems = [
  { href: '/admin/clients', icon: Users, label: 'Clients Console' },
  { href: '/admin/datasets', icon: Database, label: 'Global Datasets' },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { sidebarCollapsed, toggleSidebar } = useDashboardStore()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <aside
      className={`glass-panel m-4 mr-0 flex flex-col rounded-[1.75rem] transition-all duration-200 ${
        sidebarCollapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/50 px-4 py-5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 via-sky-200 to-emerald-200 shadow-[0_12px_30px_rgba(56,189,248,0.25)]">
          <Bot className="h-5 w-5 text-slate-700" />
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-bold tracking-wide text-slate-800">SpokesBot</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'border border-white/70 bg-white/75 text-emerald-600 shadow-[0_10px_24px_rgba(45,212,191,0.12)]'
                  : 'text-slate-500 hover:bg-white/55 hover:text-slate-800'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User + collapse */}
      <div className="space-y-1 border-t border-white/50 p-2">
        {!sidebarCollapsed && user && (
          <div className="px-3 py-2">
            <p className="truncate text-xs font-medium text-slate-800">{user.email}</p>
            <p className="text-xs capitalize text-slate-500">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors hover:bg-white/55 hover:text-red-500"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>Sign out</span>}
        </button>
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors hover:bg-white/55 hover:text-slate-800"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5 flex-shrink-0" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5 flex-shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
