import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.ts';
import type { Post, SortOption, ToolFilter } from '@/gallery/types.ts';

interface UseGalleryOptions {
  sort: SortOption;
  toolFilter: ToolFilter;
  search: string;
  page: number;
  limit: number;
  minLikes?: number;
}

interface UseGalleryReturn {
  posts: Post[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  refresh: () => void;
}

export function useGallery(options: UseGalleryOptions): UseGalleryReturn {
  const { sort, toolFilter, search, page, limit, minLikes } = options;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPosts = useCallback(async (pageNum: number) => {
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
        .from('posts')
        .select('*, profiles!posts_user_id_fkey(username, display_name, avatar_url)', { count: 'exact' });

      if (toolFilter !== 'all') {
        query = query.eq('tool_type', toolFilter);
      }

      if (minLikes !== undefined && minLikes > 0) {
        query = query.gte('likes_count', minLikes);
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

      setPosts((data ?? []) as Post[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [sort, toolFilter, search, limit, minLikes]);

  useEffect(() => {
    fetchPosts(page);

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchPosts, page]);

  const refresh = useCallback(() => {
    fetchPosts(page);
  }, [fetchPosts, page]);

  return { posts, loading, error, totalCount, refresh };
}
