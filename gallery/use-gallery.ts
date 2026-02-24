import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.ts';
import type { Post, SortOption, ToolFilter } from '@/gallery/types.ts';

interface UseGalleryOptions {
  sort: SortOption;
  toolFilter: ToolFilter;
  search: string;
  limit: number;
}

interface UseGalleryReturn {
  posts: Post[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

export function useGallery(options: UseGalleryOptions): UseGalleryReturn {
  const { sort, toolFilter, search, limit } = options;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPosts = useCallback(async (pageNum: number, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!isSupabaseConfigured) {
      setLoading(false);
      setHasMore(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const from = pageNum * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('posts')
        .select('*, profiles(username, display_name, avatar_url)');

      if (toolFilter !== 'all') {
        query = query.eq('tool_type', toolFilter);
      }

      if (search.trim()) {
        query = query.ilike('title', `%${search.trim()}%`);
      }

      if (sort === 'popular') {
        query = query.order('likes_count', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      query = query.range(from, to);

      const { data, error: fetchError } = await query;

      if (controller.signal.aborted) return;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      const fetched = (data ?? []) as Post[];

      if (append) {
        setPosts(prev => [...prev, ...fetched]);
      } else {
        setPosts(fetched);
      }

      setHasMore(fetched.length === limit);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [sort, toolFilter, search, limit]);

  useEffect(() => {
    setPage(0);
    setPosts([]);
    setHasMore(true);
    fetchPosts(0, false);

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchPosts]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage, true);
  }, [loading, hasMore, page, fetchPosts]);

  const refresh = useCallback(() => {
    setPage(0);
    setPosts([]);
    setHasMore(true);
    fetchPosts(0, false);
  }, [fetchPosts]);

  return { posts, loading, error, hasMore, loadMore, refresh };
}
