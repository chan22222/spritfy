import React from 'react';
import { Link } from 'react-router-dom';
import type { Lang } from '@/i18n.ts';
import type { Post } from '@/gallery/types.ts';
import '@/gallery/gallery-card.css';

interface GalleryCardProps {
  post: Post;
  lang: Lang;
  t: Record<string, string>;
}

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (lang === 'ko') {
    if (mins < 1) return '\uBC29\uAE08';
    if (mins < 60) return `${mins}\uBD84 \uC804`;
    if (hours < 24) return `${hours}\uC2DC\uAC04 \uC804`;
    if (days < 30) return `${days}\uC77C \uC804`;
    return new Date(dateStr).toLocaleDateString('ko-KR');
  }
  if (lang === 'ja') {
    if (mins < 1) return '\u305F\u3063\u305F\u4ECA';
    if (mins < 60) return `${mins}\u5206\u524D`;
    if (hours < 24) return `${hours}\u6642\u9593\u524D`;
    if (days < 30) return `${days}\u65E5\u524D`;
    return new Date(dateStr).toLocaleDateString('ja-JP');
  }
  // en
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US');
}

export const GalleryCard: React.FC<GalleryCardProps> = ({ post, lang, t }) => {
  const displayName = post.profiles?.display_name || post.profiles?.username || 'unknown';

  return (
    <Link to={`/${lang}/gallery/${post.id}`} className="gallery-card pixel-border" aria-label={post.title}>
      <div className="gallery-card-thumb">
        <img
          src={post.thumbnail_url || post.image_url}
          alt={post.title}
          loading="lazy"
          draggable={false}
        />
      </div>
      <div className="gallery-card-info">
        <h3 className="gallery-card-title">{post.title}</h3>
        <p className="gallery-card-meta">
          @{displayName} · {timeAgo(post.created_at, lang)}
        </p>
        <div className="gallery-card-stats">
          <span className="gallery-card-stat" aria-label={t.galleryLikes || 'Likes'}>
            <span className="material-symbols-outlined" aria-hidden="true">favorite</span>
            {post.likes_count}
          </span>
          <span className="gallery-card-stat" aria-label={t.galleryComments || 'Comments'}>
            <span className="material-symbols-outlined" aria-hidden="true">chat_bubble</span>
            {post.comments_count}
          </span>
        </div>
      </div>
    </Link>
  );
};
