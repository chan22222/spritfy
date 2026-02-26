import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.ts';
import type { BoardPost, BoardComment, BoardCategory } from '@/board/types.ts';

interface UpdateBoardPostFields {
  title: string;
  content: string;
  category: BoardCategory;
}

interface UseBoardDetailReturn {
  post: BoardPost | null;
  comments: BoardComment[];
  isLiked: boolean;
  loading: boolean;
  toggleLike: () => Promise<void>;
  addComment: (content: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  deletePost: () => Promise<void>;
  updatePost: (fields: UpdateBoardPostFields) => Promise<void>;
}

export function useBoardDetail(postId: string, userId?: string): UseBoardDetailReturn {
  const [post, setPost] = useState<BoardPost | null>(null);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchPost = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('board_posts')
        .select('*, profiles!user_id(username, display_name, avatar_url)')
        .eq('id', postId)
        .single();

      if (error) throw error;
      setPost(data as BoardPost);
    } catch {
      setPost(null);
    }
  }, [postId]);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('board_comments')
        .select('*, profiles!user_id(username, display_name, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments((data ?? []) as BoardComment[]);
    } catch {
      setComments([]);
    }
  }, [postId]);

  const checkLiked = useCallback(async () => {
    if (!userId) {
      setIsLiked(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('board_likes')
        .select('user_id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      setIsLiked(!!data);
    } catch {
      setIsLiked(false);
    }
  }, [postId, userId]);

  const incrementViews = useCallback(async () => {
    try {
      await supabase.rpc('increment_board_views', { p_id: postId });
    } catch {
      // silently fail
    }
  }, [postId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchPost(), fetchComments(), checkLiked(), incrementViews()]).finally(() => {
      setLoading(false);
    });
  }, [fetchPost, fetchComments, checkLiked, incrementViews]);

  const toggleLike = useCallback(async () => {
    if (!userId || !post) return;

    const wasLiked = isLiked;
    const prevCount = post.likes_count;

    setIsLiked(!wasLiked);
    setPost(prev => prev ? { ...prev, likes_count: wasLiked ? prev.likes_count - 1 : prev.likes_count + 1 } : prev);

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from('board_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('board_likes')
          .insert({ post_id: postId, user_id: userId });
        if (error) throw error;
      }
    } catch {
      setIsLiked(wasLiked);
      setPost(prev => prev ? { ...prev, likes_count: prevCount } : prev);
    }
  }, [userId, post, isLiked, postId]);

  const addComment = useCallback(async (content: string) => {
    if (!userId || !content.trim()) return;

    try {
      const { error } = await supabase
        .from('board_comments')
        .insert({ post_id: postId, user_id: userId, content: content.trim() });

      if (error) throw error;

      await fetchComments();
      setPost(prev => prev ? { ...prev, comments_count: prev.comments_count + 1 } : prev);
    } catch (err) {
      throw err;
    }
  }, [userId, postId, fetchComments]);

  const deleteComment = useCallback(async (commentId: string) => {
    try {
      const { error } = await supabase
        .from('board_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId ?? '');

      if (error) throw error;

      await fetchComments();
      setPost(prev => prev ? { ...prev, comments_count: Math.max(0, prev.comments_count - 1) } : prev);
    } catch (err) {
      throw err;
    }
  }, [userId, fetchComments]);

  const deletePost = useCallback(async () => {
    if (!userId || !post) return;

    try {
      const { error } = await supabase
        .from('board_posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (err) {
      throw err;
    }
  }, [userId, post, postId]);

  const updatePost = useCallback(async (fields: UpdateBoardPostFields) => {
    if (!userId || !post) return;

    const { error } = await supabase
      .from('board_posts')
      .update({
        title: fields.title,
        content: fields.content,
        category: fields.category,
      })
      .eq('id', postId)
      .eq('user_id', userId);

    if (error) throw error;

    setPost(prev => prev ? { ...prev, ...fields } : prev);
  }, [userId, post, postId]);

  return { post, comments, isLiked, loading, toggleLike, addComment, deleteComment, deletePost, updatePost };
}
