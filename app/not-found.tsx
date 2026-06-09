import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'หน้าไม่พบ (404)',
};

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-24 text-center">
      <div
        className="text-8xl font-light text-[#2E6BE6] mb-4 leading-none"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        404
      </div>
      <h1 className="text-2xl font-semibold text-[#1D1D1F] dark:text-white mb-3">
        ไม่พบหน้าที่คุณค้นหา
      </h1>
      <p className="text-[#6E6E73] dark:text-[#8E8E93] text-sm mb-8 max-w-sm leading-relaxed">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
        <br className="hidden sm:block" />
        หน้าที่คุณค้นหาไม่มีอยู่หรืออาจถูกย้ายไปแล้ว
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="px-6 py-2.5 rounded-full text-sm font-semibold bg-[#2E6BE6] text-white hover:bg-[#1E57CC] transition-colors"
        >
          กลับหน้าแรก / Home
        </Link>
        <Link
          href="/scholarships"
          className="px-6 py-2.5 rounded-full text-sm font-semibold border border-[#E5E5EA] dark:border-[#232B3E] text-[#1D1D1F] dark:text-white hover:border-[#2E6BE6] transition-colors"
        >
          ดูทุนทั้งหมด / Browse
        </Link>
      </div>
    </div>
  );
}
