export interface Sound {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  audio_url: string;
  duration: number;
  file_size: number;
  format: SoundFormat;
  category: SoundCategory;
  tags: string[];
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null };
}

export interface SoundComment {
  id: string;
  user_id: string;
  sound_id: string;
  content: string;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null };
}

export type SoundFormat = 'mp3' | 'wav' | 'ogg' | 'flac';
export type SoundCategory = 'bgm' | 'sfx' | 'ui' | 'ambient' | 'voice';
export type SoundSortOption = 'recent' | 'popular' | 'comments';
export type SoundCategoryFilter = 'all' | SoundCategory;
