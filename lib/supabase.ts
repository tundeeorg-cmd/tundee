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
  if (!isConfigured) return []
  const { data, error } = await supabase
    .from('scholarships')
    .select('*')
    .order('amount_thb', { ascending: false })
  if (error) {
    console.error('Error fetching scholarships:', error.message)
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
    .maybeSingle()
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
