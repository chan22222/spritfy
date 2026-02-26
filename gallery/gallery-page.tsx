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

const SCROLL_KEY = 'gallery_scroll';
const PAGE_KEY = 'gallery_page';

export const GalleryPage: React.FC<GalleryPageProps> = ({ lang, t }) => {
  const { user, setShowAuthModal } = useAuth();
  const [sort, setSort] = useState<SortOption>('recent');
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const limit = 20;

  const [page, setPage] = useState(() => {
    const saved = sessionStorage.getItem(PAGE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });

  const { posts, loading, error, totalCount, refresh } = useGallery({
    sort,
    toolFilter,
    search: debouncedSearch,
    page,
    limit,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  // 스크롤 복원
  useEffect(() => {
    if (!loading && posts.length > 0) {
      const savedScroll = sessionStorage.getItem(SCROLL_KEY);
      if (savedScroll) {
        const el = pageRef.current;
        if (el) {
          requestAnimationFrame(() => {
            el.scrollTop = parseInt(savedScroll, 10);
          });
        }
        sessionStorage.removeItem(SCROLL_KEY);
      }
    }
  }, [loading, posts.length]);

  // 카드 클릭 전 스크롤 위치 저장
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a.gallery-card');
      if (link) {
        sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
        sessionStorage.setItem(PAGE_KEY, String(page));
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [page]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const handleFilterChange = (f: ToolFilter) => {
    setToolFilter(f);
    setPage(0);
  };

  const handleSortChange = (s: SortOption) => {
    setSort(s);
    setPage(0);
  };

  const handleUploadClick = () => {
    if (user) {
      setShowUpload(true);
    } else {
      setShowAuthModal(true);
    }
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    setPage(0);
    refresh();
  };

  return (
    <div className="gallery-page" ref={pageRef}>
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
                onClick={() => handleFilterChange(f.key)}
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
              onClick={() => handleSortChange('recent')}
              aria-pressed={sort === 'recent'}
            >
              {t.gallerySortRecent || 'Recent'}
            </button>
            <button
              className={`gallery-sort-btn${sort === 'popular' ? ' active' : ''}`}
              onClick={() => handleSortChange('popular')}
              aria-pressed={sort === 'popular'}
            >
              {t.gallerySortPopular || 'Popular'}
            </button>
            <button
              className={`gallery-sort-btn${sort === 'comments' ? ' active' : ''}`}
              onClick={() => handleSortChange('comments')}
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

      {/* Loading */}
      {loading && (
        <div className="gallery-footer-actions">
          <div className="gallery-loading" role="status" aria-label="Loading">
            <div className="gallery-loading-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="gallery-pagination">
          <button
            className="gallery-page-btn"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            const startPage = Math.max(0, Math.min(page - 4, totalPages - 10));
            const pageNum = startPage + i;
            if (pageNum >= totalPages) return null;
            return (
              <button
                key={pageNum}
                className={`gallery-page-btn${pageNum === page ? ' active' : ''}`}
                onClick={() => setPage(pageNum)}
              >
                {pageNum + 1}
              </button>
            );
          })}
          <button
            className="gallery-page-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            aria-label="Next page"
          >
            <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      )}

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
