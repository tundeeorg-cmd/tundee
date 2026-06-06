'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[TunDee] Unhandled error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="text-6xl mb-6">⚠️</div>
      <h1 className="text-2xl font-semibold text-[#1D1D1F] dark:text-white mb-3">
        เกิดข้อผิดพลาด
      </h1>
      <p className="text-[#6E6E73] dark:text-[#8E8E93] text-sm mb-2 max-w-sm">
        Something went wrong on our end. Please try again.
      </p>
      {error.digest && (
        <p className="text-[10px] text-[#ADADB8] font-mono mb-6">
          Error ID: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
        <button
          onClick={reset}
          className="px-6 py-2.5 rounded-full text-sm font-semibold bg-[#F0A500] text-white hover:bg-[#D4920A] transition-colors"
        >
          ลองใหม่อีกครั้ง / Try Again
        </button>
        <Link
          href="/"
          className="px-6 py-2.5 rounded-full text-sm font-semibold border border-[#E5E5EA] text-[#1D1D1F] dark:text-white hover:border-[#F0A500] transition-colors"
        >
          กลับหน้าแรก / Home
        </Link>
      </div>
    </div>
  );
}
