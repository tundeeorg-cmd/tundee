import { createClient } from '@/lib/supabase/client';

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  return data as UserProfile | null;
}

/**
 * Upload an avatar and record it on the profile.
 *
 * The file goes to Supabase Storage from here — that is a storage operation,
 * its error is checked, and routing a multipart upload through our own server
 * would buy nothing. The ROW write goes to /api/profile/save, because that half
 * used to be `await supabase.from('profiles').upsert(...)` with the result
 * thrown away: a rejected write still returned a URL, the page showed the new
 * picture, and it was gone on the next reload with nothing logged anywhere.
 *
 * `userId` is no longer used for the row write — the route takes the id from
 * the session — but it still names the storage path, which is what the storage
 * policy keys on.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);

  const res = await fetch('/api/profile/save', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ avatarUrl: data.publicUrl }),
  });
  if (!res.ok) {
    // Throwing is right: the caller shows an error and the student can retry.
    // Returning the URL would show them a picture that is not actually saved.
    throw new Error(`avatar row write failed: ${res.status}`);
  }

  // Cache-busted for immediate display only; the stored value has no query.
  return `${data.publicUrl}?t=${Date.now()}`;
}

export function getInitials(nameOrEmail: string): string {
  if (!nameOrEmail) return '?';
  const cleaned = nameOrEmail.split('@')[0];
  const parts = cleaned.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}
