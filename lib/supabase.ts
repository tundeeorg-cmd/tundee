import { createBrowserClient } from '@supabase/ssr'
import type { Scholarship, ChecklistStep } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const isConfigured = supabaseUrl.startsWith('https://') && supabaseAnonKey.length > 0

// Singleton browser client — safe to use in client components for data fetching
export const supabase = isConfigured
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : createBrowserClient('https://placeholder.supabase.co', 'placeholder')

export async function getScholarships(): Promise<Scholarship[]> {
  if (!isConfigured) {
    console.warn('[TunDee] Supabase not configured — check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return []
  }
  // Use neq(false) instead of eq(true) so rows where is_active IS NULL also appear
  const { data, error } = await supabase
    .from('scholarships')
    .select('*')
    .neq('is_active', false)
    .order('amount_thb', { ascending: false, nullsFirst: false })

  // ── Debug logging (keep until scholarships reliably load) ──────────────
  console.log('=== SCHOLARSHIPS DEBUG ===')
  console.log('rows returned:', data?.length ?? 0)
  console.log('error:', error ?? 'none')
  if (data && data.length > 0) {
    console.log('first row keys:', Object.keys(data[0]))
    console.log('first row sample:', { id: data[0].id, name_th: data[0].name_th, is_active: data[0].is_active, tier: data[0].tier })
  } else {
    console.warn('[TunDee] 0 scholarships returned — most likely cause: RLS policy blocks rows where is_active IS NULL. Run this SQL in Supabase:', "UPDATE scholarships SET is_active = TRUE WHERE is_active IS NULL; DROP POLICY IF EXISTS \"Public read scholarships\" ON scholarships; CREATE POLICY \"Public read scholarships\" ON scholarships FOR SELECT USING (is_active IS NOT FALSE);")
  }
  // ──────────────────────────────────────────────────────────────────────

  if (error) {
    console.error('[TunDee] Supabase error fetching scholarships:', error.message, error.code, error.details)
    return []
  }
  return (data as Scholarship[]) ?? []
}

export async function getScholarshipById(id: string): Promise<Scholarship | null> {
  if (!isConfigured) return null
  const { data, error } = await supabase
    .from('scholarships')
    .select('*')
    .eq('id', id)
    .maybeSingle()  // deliberately no is_active filter — detail page should still show expired ones (with warning banner)
  if (error) {
    console.error('Error fetching scholarship:', error.message)
    return null
  }
  return data as Scholarship
}

export async function getChecklistSteps(): Promise<ChecklistStep[]> {
  if (!isConfigured) return []
  const { data, error } = await supabase
    .from('scholarship_checklist_steps')
    .select('*')
    .order('step_number', { ascending: true })
  if (error) {
    console.error('Error fetching checklist steps:', error.message)
    return []
  }
  return (data as ChecklistStep[]) ?? []
}
