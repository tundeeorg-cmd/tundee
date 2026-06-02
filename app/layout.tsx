import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { LanguageProvider } from '@/lib/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

export const metadata: Metadata = {
  title: 'ทุนดี (TunDee) — ค้นหาทุนการศึกษาไทย',
  description: 'ทุนดีรวบรวมทุนการศึกษาไทยกว่า 3,000 ทุน ค้นหาได้ฟรี ตรงเป้า และง่ายดาย | TunDee aggregates 3,000+ Thai scholarships — free, targeted, bilingual.',
  keywords: 'ทุนการศึกษา,scholarship,Thailand,thai scholarship,ทุนดี,tundee',
  metadataBase: new URL('https://tundee.org'),
  openGraph: {
    title: 'ทุนดี — ค้นหาทุนการศึกษาไทย',
    description: 'รวบรวมทุนการศึกษาไทยกว่า 3,000 ทุน ฟรีตลอด',
    url: 'https://tundee.org',
    siteName: 'TunDee',
    locale: 'th_TH',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <ThemeProvider>
          <LanguageProvider>
            <Nav />
            <main className="flex-1 pt-16">
              {children}
            </main>
            <Footer />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
