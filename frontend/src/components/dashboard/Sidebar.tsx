'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import {
  LayoutDashboard,
  LogOut,
  CircleHelp,
  Menu,
  X,
} from 'lucide-react'

// ─── Brand SVG icons ──────────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

function MetaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="18" height="18" rx="4" fill="#1877F2"/>
      <path d="M12.5 9H10.5V7.5C10.5 6.948 10.948 6.5 11.5 6.5H12.5V4.5H11.5C9.843 4.5 8.5 5.843 8.5 7.5V9H6.5V11H8.5V17H10.5V11H12.5V9Z" fill="white"/>
    </svg>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut, organizations } = useAuth()
  const { sidebarCollapsed, toggleSidebar, mobileMenuOpen, setMobileMenuOpen } = useDashboardStore()

  const activeOrganizationName = organizations.find((org) => org.id === user?.organization?.id)?.name
    ?? user?.organization?.name
    ?? 'Client Workspace'

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  type NavItem =
    | { href: string; icon: typeof LayoutDashboard; label: string; brandIcon?: never }
    | { href: string; brandIcon: (props: { className?: string }) => React.ReactElement; label: string; icon?: never }

  const navItems: NavItem[] = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
    { href: '/google-ads', brandIcon: GoogleIcon, label: 'Google Ads' },
    { href: '/meta-ads', brandIcon: MetaIcon, label: 'Meta Ads' },
    { href: '/help', icon: CircleHelp, label: 'Help / FAQs' },
  ]

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={() => setMobileMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-[#0f172a]/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          mobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/8 bg-[#1d2129] text-white transition-all duration-300 ease-out md:static ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${sidebarCollapsed ? 'md:w-[88px]' : 'md:w-64'} w-[280px]`}
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

          {/* Desktop Toggle */}
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden h-10 w-10 items-center justify-center rounded-xl text-[#f5f1e8] transition hover:bg-white/6 hover:text-white md:flex"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[#f5f1e8] md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

      <nav className="flex-1 px-3 py-6">
        <div className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between rounded-[1.15rem] px-5 py-4 text-[1rem] transition ${
                  isActive
                    ? 'bg-[#4a412d] text-[#f5b800]'
                    : 'text-[#b8b2a8] hover:bg-white/4 hover:text-[#f3efe7]'
                }`}
              >
                <span className={`flex items-center ${sidebarCollapsed ? 'mx-auto gap-0' : 'gap-4'}`}>
                  {item.brandIcon ? (
                    <item.brandIcon className="h-5 w-5 flex-shrink-0" />
                  ) : item.icon ? (
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                  ) : null}
                  {!sidebarCollapsed && <span>{item.label}</span>}
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
    </>
  )
}
