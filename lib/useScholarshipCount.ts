'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Returns the total count of active scholarships from the DB.
 * Defaults to `fallback` (90) until the query resolves.
 */
export function useScholarshipCount(fallback = 90): number {
  const [count, setCount] = useState(fallback);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('td_scholarships')
      .select('scholarship_id', { count: 'exact', head: true })
      .eq('is_displayed', true)
      .then(({ count: c, error }) => {
        if (!error && c !== null && c > 0) setCount(c);
      });
  }, []);

  return count;
}
