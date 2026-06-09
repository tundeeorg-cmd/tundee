import { MetadataRoute } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://www.tundee.org';
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: base,                  lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${base}/scholarships`,lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${base}/about`,       lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/tracker`,     lastModified: now, changeFrequency: 'weekly',  priority: 0.6 },
  ];

  // Dynamic scholarship pages
  try {
    const supabase = await createServerSupabaseClient();
    const { data: scholarships } = await supabase
      .from('scholarships')
      .select('id, updated_at')
      .eq('is_active', true);

    const scholarshipPages: MetadataRoute.Sitemap = (scholarships ?? []).map((s) => ({
      url: `${base}/scholarships/${s.id}`,
      lastModified: s.updated_at ? new Date(s.updated_at) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticPages, ...scholarshipPages];
  } catch {
    // If Supabase is unavailable at build time, return only static pages
    return staticPages;
  }
}
