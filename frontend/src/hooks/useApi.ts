import { useEffect, useState } from 'react';

export type AsyncState<T> = { data: T | null; loading: boolean; error: Error | null };

// Tiny async-data hook used by every page to consume the `@/lib/api` getters.
// In sample mode the promise resolves immediately; once a source is wired live it
// transparently reflects loading/error from the real backend call — no page change.
export function useApi<T>(loader: () => Promise<T>, deps: React.DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: null });
    loader()
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (alive) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
