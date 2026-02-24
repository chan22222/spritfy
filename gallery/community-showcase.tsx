import React from 'react';
import { Link } from 'react-router-dom';
import type { Lang } from '@/i18n.ts';
import { useGallery } from '@/gallery/use-gallery.ts';
import { GalleryCard } from '@/gallery/gallery-card.tsx';
import '@/gallery/community-showcase.css';

interface CommunityShowcaseProps {
  lang: Lang;
  t: Record<string, string>;
}

export const CommunityShowcase: React.FC<CommunityShowcaseProps> = ({ lang, t }) => {
  const { posts, loading } = useGallery({
    sort: 'popular',
    toolFilter: 'all',
    search: '',
    limit: 8,
  });

  return (
    <section className="community-showcase">
      <h2 className="showcase-title">
        {t.communitySectionTitle || 'Community Showcase'}
      </h2>
      <p className="showcase-subtitle">
        {t.communitySectionSubtitle || 'Latest popular works from creators'}
      </p>

      {loading ? (
        <div className="showcase-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="showcase-skeleton" aria-hidden="true">
              <div className="showcase-skeleton-thumb" />
              <div className="showcase-skeleton-info">
                <div className="showcase-skeleton-line wide" />
                <div className="showcase-skeleton-line narrow" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length > 0 ? (
        <div className="showcase-grid">
          {posts.map(post => (
            <GalleryCard key={post.id} post={post} lang={lang} t={t} />
          ))}
        </div>
      ) : (
        <div className="showcase-empty">
          <span className="material-symbols-outlined showcase-empty-icon" aria-hidden="true">palette</span>
          <p>{t.galleryEmpty || 'No posts yet'}</p>
        </div>
      )}

      <div className="showcase-view-all-wrapper">
        <Link to={`/${lang}/gallery`} className="showcase-view-all pixel-btn pixel-btn-ghost">
          {t.communityViewAll || 'View All'}
          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </Link>
      </div>
    </section>
  );
};
