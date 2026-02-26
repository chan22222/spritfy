-- ========================================
-- BOARD — 게시판 테이블 (갤러리와 분리)
-- ========================================

-- board_posts (게시판 글)
CREATE TABLE public.board_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  image_url TEXT,
  thumbnail_url TEXT,
  category TEXT NOT NULL CHECK (category IN ('free', 'question', 'tips', 'showcase', 'bug')),
  lang TEXT NOT NULL DEFAULT 'ko' CHECK (lang IN ('ko', 'en', 'ja')),
  views_count INT NOT NULL DEFAULT 0,
  likes_count INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_board_posts_created_at ON public.board_posts(created_at DESC);
CREATE INDEX idx_board_posts_likes_count ON public.board_posts(likes_count DESC);
CREATE INDEX idx_board_posts_views_count ON public.board_posts(views_count DESC);
CREATE INDEX idx_board_posts_user_id ON public.board_posts(user_id);
CREATE INDEX idx_board_posts_category ON public.board_posts(category);
CREATE INDEX idx_board_posts_lang ON public.board_posts(lang);

-- board_likes
CREATE TABLE public.board_likes (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.board_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_board_likes_post_id ON public.board_likes(post_id);

-- board_comments
CREATE TABLE public.board_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.board_posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_board_comments_post_id ON public.board_comments(post_id, created_at);

-- ========================================
-- Triggers: auto likes_count / comments_count
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_board_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.board_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.board_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_board_like_changed
  AFTER INSERT OR DELETE ON public.board_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_board_like_count();

CREATE OR REPLACE FUNCTION public.handle_board_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.board_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.board_posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_board_comment_changed
  AFTER INSERT OR DELETE ON public.board_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_board_comment_count();

-- ========================================
-- RPC: 조회수 증가
-- ========================================
CREATE OR REPLACE FUNCTION public.increment_board_views(p_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.board_posts SET views_count = views_count + 1 WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- Row Level Security
-- ========================================
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_comments ENABLE ROW LEVEL SECURITY;

-- board_posts
CREATE POLICY "board_posts_select" ON public.board_posts FOR SELECT USING (true);
CREATE POLICY "board_posts_insert" ON public.board_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "board_posts_update" ON public.board_posts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "board_posts_delete" ON public.board_posts FOR DELETE USING (auth.uid() = user_id);

-- board_likes
CREATE POLICY "board_likes_select" ON public.board_likes FOR SELECT USING (true);
CREATE POLICY "board_likes_insert" ON public.board_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "board_likes_delete" ON public.board_likes FOR DELETE USING (auth.uid() = user_id);

-- board_comments
CREATE POLICY "board_comments_select" ON public.board_comments FOR SELECT USING (true);
CREATE POLICY "board_comments_insert" ON public.board_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "board_comments_update" ON public.board_comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "board_comments_delete" ON public.board_comments FOR DELETE USING (auth.uid() = user_id);
