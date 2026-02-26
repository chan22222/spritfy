import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { useSounds } from '@/sounds/use-sounds.ts';
import { SoundCard } from '@/sounds/sound-card.tsx';
import { SoundUploadForm } from '@/sounds/sound-upload.tsx';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import type { SoundSortOption, SoundCategoryFilter } from '@/sounds/types.ts';
import '@/sounds/sound-page.css';

interface SoundPageProps {
  lang: Lang;
  t: Record<string, string>;
}

const CATEGORIES: { key: SoundCategoryFilter; i18nKey: string }[] = [
  { key: 'all', i18nKey: 'soundCatAll' },
  { key: 'bgm', i18nKey: 'soundCatBgm' },
  { key: 'sfx', i18nKey: 'soundCatSfx' },
  { key: 'ui', i18nKey: 'soundCatUi' },
  { key: 'ambient', i18nKey: 'soundCatAmbient' },
  { key: 'voice', i18nKey: 'soundCatVoice' },
];

export const SoundPage: React.FC<SoundPageProps> = ({ lang, t }) => {
  const { user, setShowAuthModal } = useAuth();
  const [sort, setSort] = useState<SoundSortOption>('recent');
  const [category, setCategory] = useState<SoundCategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 20;

  const { sounds, loading, error, totalCount, refresh } = useSounds({
    sort,
    category,
    search: debouncedSearch,
    page,
    limit,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
  }, []);

  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);

  const handleCategoryChange = (cat: SoundCategoryFilter) => { setCategory(cat); setPage(0); };
  const handleSortChange = (s: SoundSortOption) => { setSort(s); setPage(0); };

  const handleUploadClick = () => {
    if (user) setShowUpload(true);
    else setShowAuthModal(true);
  };

  const handleUploadSuccess = () => { setShowUpload(false); setPage(0); refresh(); };

  return (
    <div className="sound-page">
      <SEO
        title={t.seoSoundTitle || 'Sounds - Spritfy'}
        description={t.seoSoundDesc || 'Game sound effects and music'}
        path="/sounds"
        lang={lang}
      />

      <section className="sound-header">
        <h1 className="sound-title">{t.soundTitle || 'Sounds'}</h1>
        <p className="sound-subtitle">{t.soundSubtitle || 'Game sound effects & music'}</p>
      </section>

      <div className="sound-toolbar">
        <div className="sound-toolbar-left">
          <div className="sound-search-wrapper">
            <span className="material-symbols-outlined sound-search-icon" aria-hidden="true">search</span>
            <input
              type="text"
              className="sound-search-input"
              placeholder={t.soundSearch || 'Search...'}
              value={search}
              onChange={handleSearchChange}
              aria-label={t.soundSearch || 'Search'}
            />
          </div>
          <div className="sound-filters">
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                className={`sound-filter-btn${category === c.key ? ' active' : ''}`}
                onClick={() => handleCategoryChange(c.key)}
                aria-pressed={category === c.key}
              >
                {t[c.i18nKey] || c.key}
              </button>
            ))}
          </div>
        </div>

        <div className="sound-toolbar-right">
          <div className="sound-sort-group">
            <button className={`sound-sort-btn${sort === 'recent' ? ' active' : ''}`} onClick={() => handleSortChange('recent')} aria-pressed={sort === 'recent'}>
              {t.soundSortRecent || 'Recent'}
            </button>
            <button className={`sound-sort-btn${sort === 'popular' ? ' active' : ''}`} onClick={() => handleSortChange('popular')} aria-pressed={sort === 'popular'}>
              {t.soundSortPopular || 'Popular'}
            </button>
          </div>
          <button className="sound-upload-btn pixel-btn pixel-btn-primary" onClick={handleUploadClick}>
            <span className="material-symbols-outlined" aria-hidden="true">upload</span>
            {t.soundUpload || 'Upload'}
          </button>
        </div>
      </div>

      {error && (
        <div className="sound-error" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          {error}
        </div>
      )}

      {sounds.length > 0 ? (
        <div className="sound-grid">
          {sounds.map(s => <SoundCard key={s.id} sound={s} lang={lang} t={t} />)}
        </div>
      ) : !loading ? (
        <div className="sound-empty">
          <span className="material-symbols-outlined sound-empty-icon" aria-hidden="true">music_off</span>
          <p>{t.soundEmpty || 'No sounds yet'}</p>
        </div>
      ) : null}

      {loading && (
        <div className="sound-footer-actions">
          <div className="gallery-loading" role="status" aria-label="Loading">
            <div className="gallery-loading-dots"><span /><span /><span /></div>
          </div>
        </div>
      )}

      {totalPages > 1 && !loading && (
        <div className="sound-pagination">
          <button className="sound-page-btn" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} aria-label="Previous page">
            <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            const startPage = Math.max(0, Math.min(page - 4, totalPages - 10));
            const pageNum = startPage + i;
            if (pageNum >= totalPages) return null;
            return (
              <button key={pageNum} className={`sound-page-btn${pageNum === page ? ' active' : ''}`} onClick={() => setPage(pageNum)}>
                {pageNum + 1}
              </button>
            );
          })}
          <button className="sound-page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} aria-label="Next page">
            <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      )}

      {showUpload && <SoundUploadForm lang={lang} t={t} onClose={() => setShowUpload(false)} onSuccess={handleUploadSuccess} />}
      <Footer lang={lang} t={t} />
    </div>
  );
};
