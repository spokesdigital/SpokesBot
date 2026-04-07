'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import {
  LayoutDashboard,
  Database,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bot,
  CircleHelp,
  Menu,
  MessageCircleMore,
} from 'lucide-react'

const allNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/datasets', icon: Database, label: 'Datasets', adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut, organizations } = useAuth()
  const { sidebarCollapsed, toggleSidebar } = useDashboardStore()

  const activeOrganizationName = organizations.find((org) => org.id === user?.organization?.id)?.name
    ?? user?.organization?.name
    ?? 'Client Workspace'

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  if (user?.role !== 'admin') {
    const navItems = [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
      { href: '/help', icon: CircleHelp, label: 'Help / FAQs' },
    ]

    return (
      <aside
        className={`flex flex-col border-r border-white/8 bg-[#1d2129] text-white transition-all duration-300 ease-out ${
          sidebarCollapsed ? 'w-[88px]' : 'w-64'
        }`}
      >
        <div
          className={`flex border-b border-white/8 px-5 py-5 ${
            sidebarCollapsed
              ? 'flex-col items-center gap-3'
              : 'items-center justify-between gap-3'
          }`}
        >
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <Image
              src="/spokes-digital-logo.png"
              alt="Spokes Digital logo"
              width={42}
              height={42}
              className="h-[42px] w-[42px] object-contain"
            />
            {!sidebarCollapsed && (
              <span className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#f5f1e8]">
                Spokes Digital
              </span>
            )}
          </div>
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[#f5f1e8] transition hover:bg-white/6 hover:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-6">
          <div className="space-y-2">
            {navItems.map(({ href, icon: Icon, label }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  title={sidebarCollapsed ? label : undefined}
                  className={`flex items-center justify-between rounded-[1.15rem] px-5 py-4 text-[1rem] transition ${
                    isActive
                      ? 'bg-[#4a412d] text-[#f5b800]'
                      : 'text-[#b8b2a8] hover:bg-white/4 hover:text-[#f3efe7]'
                  }`}
                >
                  <span
                    className={`flex items-center ${sidebarCollapsed ? 'mx-auto gap-0' : 'gap-4'}`}
                  >
                    <Icon className="h-5 w-5" />
                    {!sidebarCollapsed && <span>{label}</span>}
                  </span>
                  {!sidebarCollapsed && isActive && (
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f5b800]" />
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className={`border-t border-white/8 ${sidebarCollapsed ? 'px-3 py-5' : 'px-6 py-7'}`}>
          {!sidebarCollapsed && (
            <>
              <p className="text-xs font-medium tracking-[0.18em] text-[#7d8491]">CLIENT</p>
              <p className="mt-2 text-[0.98rem] font-medium text-[#f3efe7]">
                {activeOrganizationName}
              </p>
            </>
          )}

          <button
            onClick={handleSignOut}
            title="Sign out"
            className={`flex items-center rounded-xl px-3 py-2 text-[0.98rem] text-[#b8b2a8] transition hover:bg-white/4 hover:text-[#f3efe7] ${
              sidebarCollapsed ? 'mt-0 w-full justify-center' : 'mt-10 gap-4'
            }`}
          >
            <LogOut className="h-5 w-5" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    )
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
        {allNavItems
          .filter(item => !item.adminOnly || user?.role === 'admin')
          .map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
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
