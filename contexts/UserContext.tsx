'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UserContextType {
  avatarUrl: string | null;
  displayName: string | null;
  setAvatarUrl: (url: string | null) => void;
  setDisplayName: (name: string | null) => void;
  refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  avatarUrl: null,
  displayName: null,
  setAvatarUrl: () => {},
  setDisplayName: () => {},
  refreshProfile: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  async function refreshProfile() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();
      if (data) {
        setAvatarUrl(data.avatar_url ?? null);
        setDisplayName(data.display_name ?? null);
      }
    } catch { /* ignore — columns may not exist yet */ }
  }

  // Load on mount + whenever auth changes
  useEffect(() => {
    refreshProfile();
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') refreshProfile();
      if (event === 'SIGNED_OUT') { setAvatarUrl(null); setDisplayName(null); }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <UserContext.Provider value={{ avatarUrl, displayName, setAvatarUrl, setDisplayName, refreshProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserProfile() {
  return useContext(UserContext);
}
