import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.ts';
import type { Sound, SoundComment } from '@/sounds/types.ts';

interface UpdateSoundFields {
  title: string;
  description: string | null;
  tags: string[];
  category: Sound['category'];
}

interface UseSoundDetailReturn {
  sound: Sound | null;
  comments: SoundComment[];
  isLiked: boolean;
  loading: boolean;
  toggleLike: () => Promise<void>;
  addComment: (content: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  deleteSound: () => Promise<void>;
  updateSound: (fields: UpdateSoundFields) => Promise<void>;
}

export function useSoundDetail(soundId: string, userId?: string): UseSoundDetailReturn {
  const [sound, setSound] = useState<Sound | null>(null);
  const [comments, setComments] = useState<SoundComment[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchSound = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sounds')
        .select('*, profiles!sounds_user_id_fkey(username, display_name, avatar_url)')
        .eq('id', soundId)
        .single();
      if (error) throw error;
      setSound(data as Sound);
    } catch {
      setSound(null);
    }
  }, [soundId]);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sound_comments')
        .select('*, profiles!sound_comments_user_id_fkey(username, display_name, avatar_url)')
        .eq('sound_id', soundId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setComments((data ?? []) as SoundComment[]);
    } catch {
      setComments([]);
    }
  }, [soundId]);

  const checkLiked = useCallback(async () => {
    if (!userId) { setIsLiked(false); return; }
    try {
      const { data, error } = await supabase
        .from('sound_likes')
        .select('user_id')
        .eq('sound_id', soundId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      setIsLiked(!!data);
    } catch {
      setIsLiked(false);
    }
  }, [soundId, userId]);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    Promise.all([fetchSound(), fetchComments(), checkLiked()]).finally(() => {
      setLoading(false);
    });
  }, [fetchSound, fetchComments, checkLiked]);

  const toggleLike = useCallback(async () => {
    if (!userId || !sound) return;
    const wasLiked = isLiked;
    const prevCount = sound.likes_count;

    setIsLiked(!wasLiked);
    setSound(prev => prev ? { ...prev, likes_count: wasLiked ? prev.likes_count - 1 : prev.likes_count + 1 } : prev);

    try {
      if (wasLiked) {
        const { error } = await supabase.from('sound_likes').delete().eq('sound_id', soundId).eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sound_likes').insert({ sound_id: soundId, user_id: userId });
        if (error) throw error;
      }
    } catch {
      setIsLiked(wasLiked);
      setSound(prev => prev ? { ...prev, likes_count: prevCount } : prev);
    }
  }, [userId, sound, isLiked, soundId]);

  const addComment = useCallback(async (content: string) => {
    if (!userId || !content.trim()) return;
    const { error } = await supabase.from('sound_comments').insert({ sound_id: soundId, user_id: userId, content: content.trim() });
    if (error) throw error;
    await fetchComments();
    setSound(prev => prev ? { ...prev, comments_count: prev.comments_count + 1 } : prev);
  }, [userId, soundId, fetchComments]);

  const deleteComment = useCallback(async (commentId: string) => {
    const { error } = await supabase.from('sound_comments').delete().eq('id', commentId).eq('user_id', userId ?? '');
    if (error) throw error;
    await fetchComments();
    setSound(prev => prev ? { ...prev, comments_count: Math.max(0, prev.comments_count - 1) } : prev);
  }, [userId, fetchComments]);

  const deleteSound = useCallback(async () => {
    if (!userId || !sound) return;
    const { error } = await supabase.from('sounds').delete().eq('id', soundId).eq('user_id', userId);
    if (error) throw error;
  }, [userId, sound, soundId]);

  const updateSound = useCallback(async (fields: UpdateSoundFields) => {
    if (!userId || !sound) return;
    const { error } = await supabase.from('sounds').update({
      title: fields.title,
      description: fields.description,
      tags: fields.tags,
      category: fields.category,
    }).eq('id', soundId).eq('user_id', userId);
    if (error) throw error;
    setSound(prev => prev ? { ...prev, ...fields } : prev);
  }, [userId, sound, soundId]);

  return { sound, comments, isLiked, loading, toggleLike, addComment, deleteComment, deleteSound, updateSound };
}
