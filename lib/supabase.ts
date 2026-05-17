import { createClient } from '@supabase/supabase-js';
import type { Scholarship, ChecklistStep } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getScholarships(): Promise<Scholarship[]> {
  const { data, error } = await supabase
    .from('scholarships')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching scholarships:', error.message);
    return [];
  }
  return (data as Scholarship[]) ?? [];
}

export async function getScholarshipById(id: string): Promise<Scholarship | null> {
  const { data, error } = await supabase
    .from('scholarships')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching scholarship:', error.message);
    return null;
  }
  return data as Scholarship;
}

export async function getChecklistSteps(): Promise<ChecklistStep[]> {
  const { data, error } = await supabase
    .from('scholarship_checklist_steps')
    .select('*')
    .order('step_number', { ascending: true });

  if (error) {
    console.error('Error fetching checklist steps:', error.message);
    return [];
  }
  return (data as ChecklistStep[]) ?? [];
}
