import type { Metadata } from 'next';
import { Lato } from 'next/font/google';
import './globals.css';
import ChromeGate from '@/components/ChromeGate';
import AdPixels from '@/components/AdPixels';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import MetaPixel from '@/components/MetaPixel';
import AnalyticsPageView from '@/components/AnalyticsPageView';
import SignupConversion from '@/components/SignupConversion';
import CookieConsent from '@/components/CookieConsent';
import SessionStartLogger from '@/components/SessionStartLogger';
import { LanguageProvider } from '@/lib/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UserProvider } from '@/contexts/UserContext';

const lato = Lato({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--font-lato',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.tundee.org'),
  title: {
    default: 'ทุนดี (TunDee) ค้นหาทุนการศึกษาไทย',
    template: '%s | TunDee ทุนดี',
  },
  description: 'ทุนดีรวบรวมทุนการศึกษาไทยกว่า 90 ทุน จับคู่อัตโนมัติด้วย AI ฟรีตลอด | TunDee aggregates 90+ real Thai scholarships, AI-powered matching, free, bilingual.',
  keywords: [
    'ทุนการศึกษา', 'scholarship', 'Thailand', 'thai scholarship', 'ทุนดี', 'tundee',
    'ทุนการศึกษาไทย', 'ทุนม.6', 'ทุนนักเรียน', 'Thai student scholarship',
    'scholarship matching', 'ทุนโครงการ', 'ทุนรัฐบาล', 'ทุนเอกชน',
  ],
  authors: [{ name: 'Jenissa Vichiansin', url: 'https://www.tundee.org/about' }],
  creator: 'TunDee',
  publisher: 'TunDee',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: {
    canonical: 'https://www.tundee.org',
    languages: {
      'th-TH': 'https://www.tundee.org',
      'en-US': 'https://www.tundee.org',
    },
  },
  openGraph: {
    title: 'ทุนดี ค้นหาทุนการศึกษาไทย',
    description: 'รวบรวมทุนการศึกษาไทย จับคู่อัตโนมัติด้วย AI ฟรีตลอด',
    url: 'https://www.tundee.org',
    siteName: 'TunDee ทุนดี',
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'TunDee ทุนการศึกษาไทย' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ทุนดี (TunDee) ค้นหาทุนการศึกษาไทย',
    description: 'รวบรวมทุนการศึกษาไทย จับคู่อัตโนมัติ ฟรีตลอด',
    images: ['/og-image.svg'],
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  verification: {
    google: 'nIhOC7OGoxjBxX-QBcW5KoakP8FzT_C7kexuCrX61WU',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={lato.variable} suppressHydrationWarning>
      <head>
        {/* Dark mode + Thai mode init — must be before body renders */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tundee_theme');var l=localStorage.getItem('tundee_lang')||'th';var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');if(l==='th')document.documentElement.classList.add('thai-mode');}catch(e){}})();`,
          }}
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Sarabun for Thai text */}
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-[#F5F7FA] dark:bg-[#07111F]">
        {/* Analytics & ad tags — every one gated on cookie consent
            (lib/analytics/consent.ts). Nothing loads until the visitor accepts. */}
        <GoogleAnalytics />
        <MetaPixel />
        <AnalyticsPageView />
        <SignupConversion />
        <AdPixels />
        <ThemeProvider>
          <LanguageProvider>
            <UserProvider>
              <SessionStartLogger />
              <ChromeGate>{children}</ChromeGate>
            </UserProvider>
          </LanguageProvider>
        </ThemeProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
