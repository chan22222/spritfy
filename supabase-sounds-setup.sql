-- ========================================
-- SOUNDS — 사운드 테이블
-- ========================================

CREATE TABLE public.sounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description TEXT CHECK (char_length(description) <= 500),
  audio_url TEXT NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  file_size INT NOT NULL DEFAULT 0,
  format TEXT NOT NULL CHECK (format IN ('mp3', 'wav', 'ogg', 'flac')),
  category TEXT NOT NULL CHECK (category IN ('bgm', 'sfx', 'ui', 'ambient', 'voice')),
  tags TEXT[] DEFAULT '{}',
  likes_count INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sounds_created_at ON public.sounds(created_at DESC);
CREATE INDEX idx_sounds_likes_count ON public.sounds(likes_count DESC);
CREATE INDEX idx_sounds_user_id ON public.sounds(user_id);
CREATE INDEX idx_sounds_category ON public.sounds(category);

-- sound_likes
CREATE TABLE public.sound_likes (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sound_id UUID NOT NULL REFERENCES public.sounds(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sound_id)
);

CREATE INDEX idx_sound_likes_sound_id ON public.sound_likes(sound_id);

-- sound_comments
CREATE TABLE public.sound_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sound_id UUID NOT NULL REFERENCES public.sounds(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sound_comments_sound_id ON public.sound_comments(sound_id, created_at);

-- ========================================
-- Triggers
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_sound_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.sounds SET likes_count = likes_count + 1 WHERE id = NEW.sound_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.sounds SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.sound_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_sound_like_changed
  AFTER INSERT OR DELETE ON public.sound_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sound_like_count();

CREATE OR REPLACE FUNCTION public.handle_sound_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.sounds SET comments_count = comments_count + 1 WHERE id = NEW.sound_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.sounds SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.sound_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_sound_comment_changed
  AFTER INSERT OR DELETE ON public.sound_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sound_comment_count();

-- ========================================
-- Row Level Security
-- ========================================
ALTER TABLE public.sounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sound_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sound_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sounds_select" ON public.sounds FOR SELECT USING (true);
CREATE POLICY "sounds_insert" ON public.sounds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sounds_update" ON public.sounds FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sounds_delete" ON public.sounds FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "sound_likes_select" ON public.sound_likes FOR SELECT USING (true);
CREATE POLICY "sound_likes_insert" ON public.sound_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sound_likes_delete" ON public.sound_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "sound_comments_select" ON public.sound_comments FOR SELECT USING (true);
CREATE POLICY "sound_comments_insert" ON public.sound_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sound_comments_update" ON public.sound_comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sound_comments_delete" ON public.sound_comments FOR DELETE USING (auth.uid() = user_id);
