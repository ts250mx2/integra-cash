'use client';
import { useEffect, useState } from 'react';
import { api } from './ui';

export default function useCollection<T>(
  endpoint: string | null,
  query: string,
  revision: unknown,
) {
  const path = endpoint ? `${endpoint}?${query}` : null;
  const [result, setResult] = useState<{ path: string; items: T[]; more: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<T[]>(path, { signal: controller.signal })
        .then((items) => {
          setResult({ path, items, more: items.length === 500 });
          setError('');
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(e.message);
            setResult({ path, items: [], more: false });
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, revision]);
  const items = result?.path === path ? result.items : [];
  async function loadMore() {
    if (!path || busy || !result || result.path !== path) return;
    setBusy(true);
    try {
      const next = await api<T[]>(`${path}&offset=${result.items.length}`);
      setResult((previous) =>
        previous?.path === path
          ? { path, items: [...previous.items, ...next], more: next.length === 500 }
          : previous,
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    items,
    error,
    loading: !!path && result?.path !== path,
    busy,
    hasMore: result?.path === path && result.more,
    loadMore,
  };
}
