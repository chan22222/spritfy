export interface BoardPost {
  id: string;
  user_id: string;
  title: string;
  content: string;
  image_url: string | null;
  thumbnail_url: string | null;
  category: BoardCategory;
  lang: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null };
}

export interface BoardComment {
  id: string;
  user_id: string;
  post_id: string;
  content: string;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null };
}

export type BoardCategory = 'free' | 'question' | 'tips' | 'showcase' | 'bug';
export type BoardSortOption = 'recent' | 'popular' | 'comments' | 'views';
export type BoardCategoryFilter = 'all' | BoardCategory;
