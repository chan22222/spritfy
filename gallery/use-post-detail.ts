import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.ts';
import type { Post, Comment } from '@/gallery/types.ts';

interface UpdatePostFields {
  title: string;
  description: string | null;
  tags: string[];
  tool_type: Post['tool_type'];
}

interface UsePostDetailReturn {
  post: Post | null;
  comments: Comment[];
  isLiked: boolean;
  loading: boolean;
  toggleLike: () => Promise<void>;
  addComment: (content: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  deletePost: () => Promise<void>;
  updatePost: (fields: UpdatePostFields) => Promise<void>;
}

export function usePostDetail(postId: string, userId?: string): UsePostDetailReturn {
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchPost = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles!user_id(username, display_name, avatar_url)')
        .eq('id', postId)
        .single();

      if (error) throw error;
      setPost(data as Post);
    } catch {
      setPost(null);
    }
  }, [postId]);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*, profiles!user_id(username, display_name, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments((data ?? []) as Comment[]);
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
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      setIsLiked(!!data);
    } catch {
      setIsLiked(false);
    }
  }, [postId, userId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchPost(), fetchComments(), checkLiked()]).finally(() => {
      setLoading(false);
    });
  }, [fetchPost, fetchComments, checkLiked]);

  const toggleLike = useCallback(async () => {
    if (!userId || !post) return;

    const wasLiked = isLiked;
    const prevCount = post.likes_count;

    // Optimistic update
    setIsLiked(!wasLiked);
    setPost(prev => prev ? { ...prev, likes_count: wasLiked ? prev.likes_count - 1 : prev.likes_count + 1 } : prev);

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ post_id: postId, user_id: userId });

        if (error) throw error;
      }
    } catch {
      // Revert on error
      setIsLiked(wasLiked);
      setPost(prev => prev ? { ...prev, likes_count: prevCount } : prev);
    }
  }, [userId, post, isLiked, postId]);

  const addComment = useCallback(async (content: string) => {
    if (!userId || !content.trim()) return;

    try {
      const { error } = await supabase
        .from('comments')
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
        .from('comments')
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
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (err) {
      throw err;
    }
  }, [userId, post, postId]);

  const updatePost = useCallback(async (fields: UpdatePostFields) => {
    if (!userId || !post) return;

    const { error } = await supabase
      .from('posts')
      .update({
        title: fields.title,
        description: fields.description,
        tags: fields.tags,
        tool_type: fields.tool_type,
      })
      .eq('id', postId)
      .eq('user_id', userId);

    if (error) throw error;

    setPost(prev => prev ? { ...prev, ...fields } : prev);
  }, [userId, post, postId]);

  return { post, comments, isLiked, loading, toggleLike, addComment, deleteComment, deletePost, updatePost };
}
