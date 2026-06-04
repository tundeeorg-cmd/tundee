'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

export default function Toast({ message, type, visible }: ToastProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
    } else {
      // Small delay so the fade-out CSS can play
      const t = setTimeout(() => setShow(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!show) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[9999] pointer-events-none"
      style={{ transform: 'translateX(-50%)' }}
    >
      <div
        style={{
          background: type === 'success' ? '#1D1D1F' : '#FF3B30',
          color: '#fff',
          padding: '12px 22px',
          borderRadius: 24,
          fontSize: 14,
          fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.28)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {message}
      </div>
    </div>
  );
}
