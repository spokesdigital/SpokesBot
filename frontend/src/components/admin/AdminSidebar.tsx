'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import { useShallow } from 'zustand/react/shallow'
import {
  Users,
  Upload,
  FileBarChart,
  Activity,
  LogOut,
  ChevronLeft,
  ChevronRight,
  AlertOctagon,
  LayoutDashboard,
  Settings,
  BookOpen,
} from 'lucide-react'

const navItems = [
  { href: '/admin/overview',    icon: LayoutDashboard, label: 'Overview' },
  { href: '/admin/clients',     icon: Users,           label: 'Clients' },
  { href: '/admin/uploads',     icon: Upload,          label: 'Data Uploads' },
  { href: '/admin/reports',     icon: FileBarChart,    label: 'Reports' },
  { href: '/admin/activity',    icon: Activity,        label: 'Activity Logs' },
  { href: '/admin/escalations', icon: AlertOctagon,    label: 'Escalations' },
  { href: '/admin/help',        icon: BookOpen,        label: 'Help Articles' },
  { href: '/admin/settings',    icon: Settings,        label: 'Settings' },
]

export function AdminSidebar({ onClose }: { onClose?: () => void } = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { sidebarCollapsed, toggleSidebar } = useDashboardStore(
    useShallow((s) => ({
      sidebarCollapsed: s.sidebarCollapsed,
      toggleSidebar: s.toggleSidebar,
    }))
  )

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <aside
      className={`sidebar-dark m-4 mr-0 flex flex-col rounded-[1.75rem] transition-all duration-200 bg-[#161b26] text-slate-300 shadow-[0_8px_32px_rgba(0,0,0,0.2)] border border-white/5 ${
        sidebarCollapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#2e3446] border border-white/10">
          <Image
            src="/spokes-digital-logo.png"
            alt="Spokes Digital"
            width={22}
            height={22}
            className="h-[22px] w-[22px] object-contain opacity-90 brightness-[2]"
          />
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-wide text-white">Spokes Digital</span>
            <span className="text-[9px] font-medium text-slate-400 mt-0.5" style={{ lineHeight: '1' }}>AI Marketing Analytics</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          const isEscalations = href === '/admin/escalations'
          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? isEscalations
                    ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                    : 'border border-white/10 bg-white/5 text-white shadow-sm'
                  : isEscalations
                    ? 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User + collapse */}
      <div className="space-y-1 border-t border-white/10 p-2">
        {!sidebarCollapsed && user && (
          <div className="px-3 py-2">
            <p className="truncate text-xs font-medium text-white">{user.email}</p>
            <p className="text-xs capitalize text-slate-500">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-red-400"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>Sign out</span>}
        </button>
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
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
