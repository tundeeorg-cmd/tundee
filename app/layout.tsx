import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import BackToTop from '@/components/BackToTop';
import { LanguageProvider } from '@/lib/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UserProvider } from '@/contexts/UserContext';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.tundee.org'),
  title: {
    default: 'ทุนดี (TunDee) — ค้นหาทุนการศึกษาไทย',
    template: '%s | TunDee ทุนดี',
  },
  description: 'ทุนดีรวบรวมทุนการศึกษาไทยกว่า 90 ทุน จับคู่อัตโนมัติด้วย AI ฟรีตลอด | TunDee aggregates 90+ real Thai scholarships — AI-powered matching, free, bilingual.',
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
    title: 'ทุนดี — ค้นหาทุนการศึกษาไทย',
    description: 'รวบรวมทุนการศึกษาไทย จับคู่อัตโนมัติด้วย AI ฟรีตลอด',
    url: 'https://www.tundee.org',
    siteName: 'TunDee ทุนดี',
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'TunDee — ทุนการศึกษาไทย' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ทุนดี (TunDee) — ค้นหาทุนการศึกษาไทย',
    description: 'รวบรวมทุนการศึกษาไทย จับคู่อัตโนมัติ ฟรีตลอด',
    images: ['/og-image.svg'],
  },
  verification: {
    google: 'nIhOC7OGoxjBxX-QBcW5KoakP8FzT_C7kexuCrX61WU',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="th">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tundee_theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
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
              <Nav />
              <main className="flex-1 pt-16 pb-[70px] md:pb-0">
                {children}
              </main>
              <div className="hidden md:block">
                <Footer />
              </div>
              <BackToTop />
              <BottomNav />
            </UserProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

