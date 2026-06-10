import type { Metadata } from 'next';
import Script from 'next/script';
import { Lato } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import BackToTop from '@/components/BackToTop';
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
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

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
        {/* Google Analytics */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{page_path:window.location.pathname});`}
            </Script>
          </>
        )}
        <ThemeProvider>
          <LanguageProvider>
            <UserProvider>
              <SessionStartLogger />
              <Nav />
              <main className="flex-1 pt-[52px] pb-[60px] md:pb-0">
                {children}
              </main>
              <Footer />
              <BackToTop />
              <BottomNav />
            </UserProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
