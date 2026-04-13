'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { useDashboardStore } from '@/store/dashboard'
import type { Organization, UserProfile } from '@/types'

interface AuthContextValue {
  user: UserProfile | null
  organizations: Organization[]
  session: Session | null
  loading: boolean
  createOrganization: (name: string) => Promise<Organization>
  refreshOrganizations: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const loadGenRef = useRef(0) // increments on each loadProfile call; stale calls bail out
  const setOrganization = useDashboardStore((state) => state.setOrganization)
  const resetDashboard = useDashboardStore((state) => state.reset)

  const syncOrganizations = useCallback((profile: UserProfile, orgs: Organization[]) => {
    setOrganizations(orgs)
    const currentOrgId = useDashboardStore.getState().organizationId
    const preferredOrgId = profile.organization?.id ?? orgs[0]?.id ?? null
    const isCurrentValid = currentOrgId ? orgs.some((org) => org.id === currentOrgId) : false
    if (!isCurrentValid) {
      setOrganization(preferredOrgId)
    }
  }, [setOrganization])

  const loadOrganizations = useCallback(async (token: string, profile: UserProfile) => {
    if (profile.role === 'admin') {
      const orgs = await api.organizations.list(token)
      syncOrganizations(profile, orgs)
      return
    }

    syncOrganizations(profile, profile.organization ? [profile.organization] : [])
  }, [syncOrganizations])

  const loadProfile = useCallback(async (token: string) => {
    const gen = ++loadGenRef.current
    try {
      const profile = await api.auth.me(token)
      if (gen !== loadGenRef.current) return // a newer call superseded us — discard
      setUser(profile)
      // Fire org loading without awaiting so the loading gate (loading=false)
      // resolves right after the profile fetch, not after the org list fetch.
      // Pages render immediately; the org switcher/name populates ~150ms later.
      void loadOrganizations(token, profile)
    } catch {
      if (gen !== loadGenRef.current) return
      setUser(null)
      setOrganizations([])
      setSession(null)
      const supabase = createClient()
      await supabase.auth.signOut()
      resetDashboard()
    }
  }, [loadOrganizations, resetDashboard])

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    let initialHydrationDone = false

    // Keep session and profile in sync
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        // Deduplicate: ignore INITIAL_SESSION on mount since getSession() handles it
        if (event === 'INITIAL_SESSION' && !initialHydrationDone) return

        setSession(session)
        if (session) {
          await loadProfile(session.access_token)
        } else {
          setUser(null)
          setOrganizations([])
          resetDashboard()
          if (!initialHydrationDone) {
            setLoading(false)
          }
        }
      },
    )

    // Hydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      initialHydrationDone = true
      setSession(session)
      if (session) {
        loadProfile(session.access_token).finally(() => {
          if (mounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile, resetDashboard])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.session) throw new Error('No session returned after sign-in. Please verify your email.')
    setSession(data.session)
    await loadProfile(data.session.access_token)
  }, [loadProfile])

  const signOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setOrganizations([])
    resetDashboard()
  }, [resetDashboard])

  const refreshOrganizations = useCallback(async () => {
    if (!session || !user) return
    await loadOrganizations(session.access_token, user)
  }, [loadOrganizations, session, user])

  const createOrganization = useCallback(async (name: string) => {
    if (!session) throw new Error('You must be signed in.')
    const organization = await api.organizations.create({ name }, session.access_token)
    try {
      await refreshOrganizations()
    } catch {
      // Refresh failed — organization was still created, UI will sync on next navigation
    }
    setOrganization(organization.id)
    return organization
  }, [refreshOrganizations, session, setOrganization])

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        session,
        loading,
        createOrganization,
        refreshOrganizations,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
