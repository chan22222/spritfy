export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  image_url: string;
  thumbnail_url: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  format: 'png' | 'gif' | 'webp';
  tags: string[];
  tool_type: 'character_human' | 'character_monster' | 'character_animal' | 'effect' | 'ui' | 'tile_map' | 'item' | 'icon' | 'background' | 'other';
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null };
}

export interface Comment {
  id: string;
  user_id: string;
  post_id: string;
  content: string;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null };
}

export type SortOption = 'recent' | 'popular';
export type ToolFilter = 'all' | Post['tool_type'];
