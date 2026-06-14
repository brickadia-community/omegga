import { useEffect, useState } from 'react';

// matches the $mobile breakpoint used across the scss
const MOBILE_QUERY = '(max-width: 600px)';

export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    // sync in case it changed between render and effect
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};
