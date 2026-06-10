'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { getDeadlineInfo } from '@/lib/deadline';

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg className={`w-6 h-6 ${active ? 'text-[#1B3A6B]' : 'text-[#ADADB8]'}`} fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const SearchIcon = ({ active }: { active: boolean }) => (
  <svg className={`w-6 h-6 ${active ? 'text-[#1B3A6B]' : 'text-[#ADADB8]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.2 : 1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const TrackerIcon = ({ active }: { active: boolean }) => (
  <svg className={`w-6 h-6 ${active ? 'text-[#1B3A6B]' : 'text-[#ADADB8]'}`} fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const ProfileIcon = ({ active }: { active: boolean }) => (
  <svg className={`w-6 h-6 ${active ? 'text-[#1B3A6B]' : 'text-[#ADADB8]'}`} fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

export default function BottomNav() {
  const pathname = usePathname();
  const { lang } = useLang();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasUrgent, setHasUrgent] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) return;
      setIsLoggedIn(true);

      // Check for urgent deadlines in tracked scholarships
      try {
        const { data: apps } = await supabase
          .from('applications')
          .select('scholarships(deadline_date)')
          .eq('user_id', data.session.user.id)
          .in('status', ['started', 'in_progress']);

        if (apps) {
          const urgent = apps.some((app) => {
            const s = (app.scholarships as unknown) as { deadline_date: string | null } | null;
            if (!s?.deadline_date) return false;
            const info = getDeadlineInfo(s.deadline_date);
            return info.color === 'red' || info.color === 'orange';
          });
          setHasUrgent(urgent);
        }
      } catch {
        // silent
      }
    });
  }, []);

  const navItems = [
    {
      href: '/',
      label: lang === 'th' ? 'หน้าแรก' : 'Home',
      icon: (active: boolean) => <HomeIcon active={active} />,
      active: pathname === '/',
    },
    {
      href: '/scholarships',
      label: lang === 'th' ? 'ค้นหา' : 'Search',
      icon: (active: boolean) => <SearchIcon active={active} />,
      active: pathname.startsWith('/scholarships'),
    },
    {
      href: '/tracker',
      label: lang === 'th' ? 'ติดตาม' : 'Tracker',
      icon: (active: boolean) => <TrackerIcon active={active} />,
      active: pathname === '/tracker',
      badge: hasUrgent,
      requiresAuth: true,
    },
    {
      href: isLoggedIn ? '/profile' : '/auth',
      label: lang === 'th' ? 'โปรไฟล์' : 'Profile',
      icon: (active: boolean) => <ProfileIcon active={active} />,
      active: pathname === '/profile' || pathname === '/auth',
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#07111F] border-t border-[#E5E5EA] dark:border-[#1A2E4A]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[60px] relative"
          >
            <div className="relative">
              {item.icon(item.active)}
              {item.badge && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-[#161B27]" />
              )}
            </div>
            <span
              className={`text-[10px] font-medium leading-none ${
                item.active ? 'text-[#1B3A6B]' : 'text-[#ADADB8] dark:text-[#636366]'
              }`}
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
