import { useEffect, useState } from 'react';

/** Matches Tailwind `lg` — mobile/tablet layouts below 1024px. */
export function useIsMobile(breakpoint = '(max-width: 1023px)') {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(breakpoint).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(breakpoint);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);

  return matches;
}
