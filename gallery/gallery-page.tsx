import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { useGallery } from '@/gallery/use-gallery.ts';
import { GalleryCard } from '@/gallery/gallery-card.tsx';
import { UploadForm } from '@/gallery/upload-form.tsx';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import type { SortOption, ToolFilter } from '@/gallery/types.ts';
import '@/gallery/gallery-page.css';

interface GalleryPageProps {
  lang: Lang;
  t: Record<string, string>;
}

const TOOL_FILTERS: { key: ToolFilter; i18nKey: string }[] = [
  { key: 'all', i18nKey: 'galleryFilterAll' },
  { key: 'character_human', i18nKey: 'catCharHuman' },
  { key: 'character_monster', i18nKey: 'catCharMonster' },
  { key: 'character_animal', i18nKey: 'catCharAnimal' },
  { key: 'effect', i18nKey: 'catEffect' },
  { key: 'ui', i18nKey: 'catUI' },
  { key: 'tile_map', i18nKey: 'catTileMap' },
  { key: 'item', i18nKey: 'catItem' },
  { key: 'icon', i18nKey: 'catIcon' },
  { key: 'background', i18nKey: 'catBackground' },
  { key: 'other', i18nKey: 'catOther' },
];

export const GalleryPage: React.FC<GalleryPageProps> = ({ lang, t }) => {
  const { user, setShowAuthModal } = useAuth();
  const [sort, setSort] = useState<SortOption>('recent');
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { posts, loading, error, hasMore, loadMore, refresh } = useGallery({
    sort,
    toolFilter,
    search: debouncedSearch,
    limit: 20,
  });

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const handleUploadClick = () => {
    if (user) {
      setShowUpload(true);
    } else {
      setShowAuthModal(true);
    }
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    refresh();
  };

  return (
    <div className="gallery-page">
      <SEO
        title={t.seoGalleryTitle || 'Gallery - Spritfy'}
        description={t.seoGalleryDesc || 'Community pixel art gallery'}
        path="/gallery"
        lang={lang}
      />

      {/* Header */}
      <section className="gallery-header">
        <h1 className="gallery-title">{t.galleryTitle || 'Gallery'}</h1>
        <p className="gallery-subtitle">{t.gallerySubtitle || 'Community pixel art showcase'}</p>
      </section>

      {/* Toolbar */}
      <div className="gallery-toolbar">
        <div className="gallery-toolbar-left">
          <div className="gallery-search-wrapper">
            <span className="material-symbols-outlined gallery-search-icon" aria-hidden="true">search</span>
            <input
              type="text"
              className="gallery-search-input"
              placeholder={t.gallerySearchPlaceholder || 'Search...'}
              value={search}
              onChange={handleSearchChange}
              aria-label={t.gallerySearchPlaceholder || 'Search'}
            />
          </div>

          <div className="gallery-filters">
            {TOOL_FILTERS.map(f => (
              <button
                key={f.key}
                className={`gallery-filter-btn${toolFilter === f.key ? ' active' : ''}`}
                onClick={() => setToolFilter(f.key)}
                aria-pressed={toolFilter === f.key}
              >
                {t[f.i18nKey] || f.key}
              </button>
            ))}
          </div>
        </div>

        <div className="gallery-toolbar-right">
          <div className="gallery-sort-group">
            <button
              className={`gallery-sort-btn${sort === 'recent' ? ' active' : ''}`}
              onClick={() => setSort('recent')}
              aria-pressed={sort === 'recent'}
            >
              {t.gallerySortRecent || 'Recent'}
            </button>
            <button
              className={`gallery-sort-btn${sort === 'popular' ? ' active' : ''}`}
              onClick={() => setSort('popular')}
              aria-pressed={sort === 'popular'}
            >
              {t.gallerySortPopular || 'Popular'}
            </button>
            <button
              className={`gallery-sort-btn${sort === 'comments' ? ' active' : ''}`}
              onClick={() => setSort('comments')}
              aria-pressed={sort === 'comments'}
            >
              {t.gallerySortComments || 'Comments'}
            </button>
          </div>

          <button className="gallery-upload-btn pixel-btn pixel-btn-primary" onClick={handleUploadClick}>
            <span className="material-symbols-outlined" aria-hidden="true">upload</span>
            {t.galleryUpload || 'Upload'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="gallery-error" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          {error}
        </div>
      )}

      {/* Grid */}
      {posts.length > 0 ? (
        <div className="gallery-grid">
          {posts.map(post => (
            <GalleryCard key={post.id} post={post} lang={lang} t={t} />
          ))}
        </div>
      ) : !loading ? (
        <div className="gallery-empty">
          <span className="material-symbols-outlined gallery-empty-icon" aria-hidden="true">image</span>
          <p>{t.galleryEmpty || 'No posts yet'}</p>
        </div>
      ) : null}

      {/* Load More / Loading */}
      <div className="gallery-footer-actions">
        {loading && (
          <div className="gallery-loading" role="status" aria-label="Loading">
            <div className="gallery-loading-dots">
              <span /><span /><span />
            </div>
          </div>
        )}
        {!loading && hasMore && posts.length > 0 && (
          <button className="gallery-load-more pixel-btn pixel-btn-ghost" onClick={loadMore}>
            {t.galleryLoadMore || 'Load More'}
          </button>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <UploadForm
          lang={lang}
          t={t}
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Footer */}
      <Footer lang={lang} t={t} />
    </div>
  );
};
