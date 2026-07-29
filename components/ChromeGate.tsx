'use client';

import { usePathname } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import BackToTop from '@/components/BackToTop';

// Standalone ad-landing routes render without the site's global nav/footer
// chrome so there's nothing pulling a cold ad visitor away from the CTA.
const CHROMELESS_PATHS = ['/start'];

export default function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const chromeless = CHROMELESS_PATHS.includes(pathname);

  if (chromeless) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      <Nav />
      <main className="flex-1 pt-[52px] pb-[60px] md:pb-0">
        {children}
      </main>
      <Footer />
      <BackToTop />
      <BottomNav />
    </>
  );
}
