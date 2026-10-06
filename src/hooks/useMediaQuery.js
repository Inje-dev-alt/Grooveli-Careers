import { useEffect, useState } from 'react';

/** Subscribe to a media query. Used to decide between world and compact chrome. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** The single breakpoint the app branches on. */
export const COMPACT_QUERY = '(max-width: 860px)';
export const useIsCompact = () => useMediaQuery(COMPACT_QUERY);
