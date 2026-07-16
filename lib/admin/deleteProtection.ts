import { createClient } from '@/lib/supabase/client';

export interface DeleteCheckResult {
  safe: boolean;
  activeApplications: number;
  message: string;
}

export async function checkDeleteSafe(scholarshipId: string): Promise<DeleteCheckResult> {
  const supabase = createClient();
  try {
    const { count, error } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('scholarship_id', scholarshipId)
      .in('status', ['in_progress', 'submitted']);

    if (error) {
      // RLS or table missing — don't block admin
      return { safe: true, activeApplications: 0, message: '' };
    }

    const n = count ?? 0;
    return {
      safe: n === 0,
      activeApplications: n,
      message:
        n > 0
          ? `มีนักเรียน ${n} คนกำลังสมัครทุนนี้อยู่ / ${n} student${n !== 1 ? 's have' : ' has'} active applications for this scholarship.`
          : '',
    };
  } catch {
    return { safe: true, activeApplications: 0, message: '' };
  }
}
