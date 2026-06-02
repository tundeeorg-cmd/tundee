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

export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('profiles')
    .upsert({ id: userId, display_name: name, updated_at: new Date().toISOString() });
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  // Bust cache with timestamp
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
  await supabase
    .from('profiles')
    .upsert({ id: userId, avatar_url: data.publicUrl, updated_at: new Date().toISOString() });
  return publicUrl;
}

export function getInitials(nameOrEmail: string): string {
  if (!nameOrEmail) return '?';
  const cleaned = nameOrEmail.split('@')[0];
  const parts = cleaned.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}
