import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { useBoard } from '@/board/use-board.ts';
import { BoardWriteForm } from '@/board/board-write.tsx';
import { useLangPath } from '@/lang-context.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import type { BoardSortOption, BoardCategoryFilter } from '@/board/types.ts';
import '@/board/board-page.css';

interface BoardPageProps {
  lang: Lang;
  t: Record<string, string>;
}

const CATEGORIES: { key: BoardCategoryFilter; i18nKey: string }[] = [
  { key: 'all', i18nKey: 'boardCatAll' },
  { key: 'free', i18nKey: 'boardCatFree' },
  { key: 'question', i18nKey: 'boardCatQuestion' },
  { key: 'tips', i18nKey: 'boardCatTips' },
  { key: 'showcase', i18nKey: 'boardCatShowcase' },
  { key: 'bug', i18nKey: 'boardCatBug' },
];

function formatDate(dateStr: string, lang: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString(lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

export const BoardPage: React.FC<BoardPageProps> = ({ lang, t }) => {
  const { user, setShowAuthModal } = useAuth();
  const lp = useLangPath();
  const [sort, setSort] = useState<BoardSortOption>('recent');
  const [category, setCategory] = useState<BoardCategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showWrite, setShowWrite] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 20;

  const { posts, loading, error, totalCount, refresh } = useBoard({
    lang,
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

  const handleCategoryChange = (cat: BoardCategoryFilter) => {
    setCategory(cat);
    setPage(0);
  };

  const handleSortChange = (s: BoardSortOption) => {
    setSort(s);
    setPage(0);
  };

  const handleWriteClick = () => {
    if (user) {
      setShowWrite(true);
    } else {
      setShowAuthModal(true);
    }
  };

  const handleWriteSuccess = () => {
    setShowWrite(false);
    setPage(0);
    refresh();
  };

  return (
    <div className="board-page">
      <SEO
        title={t.seoBoardTitle || 'Board - Spritfy'}
        description={t.seoBoardDesc || 'Spritfy community board'}
        path="/board"
        lang={lang}
      />

      <section className="board-header">
        <h1 className="board-title">{t.boardTitle || 'Board'}</h1>
        <p className="board-subtitle">{t.boardSubtitle || 'Community discussion board'}</p>
      </section>

      <div className="board-toolbar">
        <div className="board-categories">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              className={`board-cat-btn${category === c.key ? ' active' : ''}`}
              onClick={() => handleCategoryChange(c.key)}
              aria-pressed={category === c.key}
            >
              {t[c.i18nKey] || c.key}
            </button>
          ))}
        </div>

        <div className="board-toolbar-right">
          <div className="board-search-wrapper">
            <span className="material-symbols-outlined board-search-icon" aria-hidden="true">search</span>
            <input
              type="text"
              className="board-search-input"
              placeholder={t.boardSearch || 'Search...'}
              value={search}
              onChange={handleSearchChange}
              aria-label={t.boardSearch || 'Search'}
            />
          </div>

          <button className="board-write-btn pixel-btn pixel-btn-primary" onClick={handleWriteClick}>
            <span className="material-symbols-outlined" aria-hidden="true">edit</span>
            {t.boardWrite || 'Write'}
          </button>
        </div>
      </div>

      {error && (
        <div className="board-error" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          {error}
        </div>
      )}

      <div className="board-table-wrapper">
        <table className="board-table">
          <thead>
            <tr>
              <th className="board-th-category">{t.boardThCategory || 'Category'}</th>
              <th className="board-th-title">{t.boardThTitle || 'Title'}</th>
              <th className="board-th-author">{t.boardThAuthor || 'Author'}</th>
              <th className="board-th-date">
                <button
                  className={`board-sort-link${sort === 'recent' ? ' active' : ''}`}
                  onClick={() => handleSortChange('recent')}
                >
                  {t.boardThDate || 'Date'}
                </button>
              </th>
              <th className="board-th-views">
                <button
                  className={`board-sort-link${sort === 'views' ? ' active' : ''}`}
                  onClick={() => handleSortChange('views')}
                >
                  {t.boardThViews || 'Views'}
                </button>
              </th>
              <th className="board-th-likes">
                <button
                  className={`board-sort-link${sort === 'popular' ? ' active' : ''}`}
                  onClick={() => handleSortChange('popular')}
                >
                  {t.boardThLikes || 'Likes'}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.length > 0 ? (
              posts.map(post => {
                const displayName = post.profiles?.display_name || post.profiles?.username || 'unknown';
                return (
                  <tr key={post.id} className="board-row">
                    <td className="board-td-category">
                      <span className={`board-cat-badge cat-${post.category}`}>
                        {t[`boardCat${post.category.charAt(0).toUpperCase()}${post.category.slice(1)}`] || post.category}
                      </span>
                    </td>
                    <td className="board-td-title">
                      <Link to={lp(`/board/${post.id}`)} className="board-title-link">
                        {post.image_url && (
                          <span className="material-symbols-outlined board-has-image" aria-label="Has image">image</span>
                        )}
                        <span className="board-title-text">{post.title}</span>
                        {post.comments_count > 0 && (
                          <span className="board-comment-count">[{post.comments_count}]</span>
                        )}
                      </Link>
                    </td>
                    <td className="board-td-author">{displayName}</td>
                    <td className="board-td-date">{formatDate(post.created_at, lang)}</td>
                    <td className="board-td-views">{post.views_count}</td>
                    <td className="board-td-likes">{post.likes_count}</td>
                  </tr>
                );
              })
            ) : !loading ? (
              <tr>
                <td colSpan={6} className="board-empty-row">
                  <span className="material-symbols-outlined" aria-hidden="true">forum</span>
                  {t.boardEmpty || 'No posts yet'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="board-loading" role="status" aria-label="Loading">
          <div className="gallery-loading-dots">
            <span /><span /><span />
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="board-pagination">
          <button
            className="board-page-btn"
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
                className={`board-page-btn${pageNum === page ? ' active' : ''}`}
                onClick={() => setPage(pageNum)}
              >
                {pageNum + 1}
              </button>
            );
          })}
          <button
            className="board-page-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            aria-label="Next page"
          >
            <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      )}

      {showWrite && (
        <BoardWriteForm
          lang={lang}
          t={t}
          onClose={() => setShowWrite(false)}
          onSuccess={handleWriteSuccess}
        />
      )}

      <Footer lang={lang} t={t} />
    </div>
  );
};
