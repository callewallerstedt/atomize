'use client';

import { useEffect } from 'react';

export function IOSInputFix() {
  useEffect(() => {
    // iOS PWA input focus fix
    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        // Force focus after a small delay (do not preventDefault on iOS)
        setTimeout(() => {
          (target as HTMLInputElement | HTMLTextAreaElement).focus();
        }, 10);
      }
    };

    // Add global touch event listener
    document.addEventListener('touchstart', handleTouchStart, { passive: false });

    // Also handle click events for good measure
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        setTimeout(() => {
          (target as HTMLInputElement | HTMLTextAreaElement).focus();
        }, 10);
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  return null;
}
