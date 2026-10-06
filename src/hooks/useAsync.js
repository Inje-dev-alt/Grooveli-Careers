import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Run a service call and expose the three states every screen needs: loading,
 * error and data. Having one hook for this is what keeps loading and error
 * states from being forgotten — they are the default, not an afterthought.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {unknown[]} deps
 * @param {{ immediate?: boolean, initialData?: T }} [options]
 */
export function useAsync(fn, deps = [], options = {}) {
  const { immediate = true, initialData = null } = options;
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState(immediate ? 'loading' : 'idle');
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const runId = useRef(0);
  // Keep the latest fn without making it a dependency of `run`.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++runId.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await fnRef.current();
      // Ignore everything but the most recent call, so a slow earlier request
      // cannot overwrite a fast later one.
      if (!mounted.current || id !== runId.current) return undefined;
      setData(result);
      setStatus('success');
      return result;
    } catch (caught) {
      if (!mounted.current || id !== runId.current) return undefined;
      setError(caught);
      setStatus('error');
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
  }, deps);

  return {
    data,
    error,
    status,
    isLoading: status === 'loading',
    isError: status === 'error',
    isEmpty: status === 'success' && (Array.isArray(data) ? data.length === 0 : data == null),
    refetch: run,
    setData,
  };
}
