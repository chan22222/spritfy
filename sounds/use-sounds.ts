import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.ts';
import type { Sound, SoundSortOption, SoundCategoryFilter } from '@/sounds/types.ts';

interface UseSoundsOptions {
  sort: SoundSortOption;
  category: SoundCategoryFilter;
  search: string;
  page: number;
  limit: number;
}

interface UseSoundsReturn {
  sounds: Sound[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  refresh: () => void;
}

export function useSounds(options: UseSoundsOptions): UseSoundsReturn {
  const { sort, category, search, page, limit } = options;
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSounds = useCallback(async (pageNum: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const from = pageNum * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('sounds')
        .select('*, profiles!sounds_user_id_fkey(username, display_name, avatar_url)', { count: 'exact' });

      if (category !== 'all') {
        query = query.eq('category', category);
      }

      if (search.trim()) {
        query = query.ilike('title', `%${search.trim()}%`);
      }

      if (sort === 'popular') {
        query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
      } else if (sort === 'comments') {
        query = query.order('comments_count', { ascending: false }).order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      query = query.range(from, to);

      const { data, error: fetchError, count } = await query;

      if (controller.signal.aborted) return;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setSounds((data ?? []) as Sound[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch sounds');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [sort, category, search, limit]);

  useEffect(() => {
    fetchSounds(page);
    return () => { abortRef.current?.abort(); };
  }, [fetchSounds, page]);

  const refresh = useCallback(() => {
    fetchSounds(page);
  }, [fetchSounds, page]);

  return { sounds, loading, error, totalCount, refresh };
}
