import React, { useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { useBoardDetail } from '@/board/use-board-detail.ts';
import { BoardEditModal } from '@/board/board-edit-modal.tsx';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import '@/board/board-detail.css';
import '@/gallery/post-detail.css';

interface BoardDetailProps {
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
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US');
}

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  ko: { free: '\uC790\uC720', question: '\uC9C8\uBB38', tips: '\uD301/\uB178\uD558\uC6B0', showcase: '\uC791\uD488\uACF5\uC720', bug: '\uBC84\uADF8\uC81C\uBCF4' },
  en: { free: 'Free', question: 'Question', tips: 'Tips', showcase: 'Showcase', bug: 'Bug Report' },
  ja: { free: '\u81EA\u7531', question: '\u8CEA\u554F', tips: '\u30C6\u30A3\u30C3\u30D7\u30B9', showcase: '\u4F5C\u54C1\u5171\u6709', bug: '\u30D0\u30B0\u5831\u544A' },
};

export const BoardDetailPage: React.FC<BoardDetailProps> = ({ lang, t }) => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user, setShowAuthModal } = useAuth();

  const {
    post,
    comments,
    isLiked,
    loading,
    toggleLike,
    addComment,
    deleteComment,
    deletePost,
    updatePost,
  } = useBoardDetail(postId ?? '', user?.id);

  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  const handleLike = useCallback(async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    try {
      await toggleLike();
    } catch {
      // handled in hook
    }
  }, [user, toggleLike, setShowAuthModal]);

  const handleCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!commentText.trim()) return;

    setCommentSubmitting(true);
    setCommentError('');
    try {
      await addComment(commentText);
      setCommentText('');
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setCommentSubmitting(false);
    }
  }, [user, commentText, addComment, setShowAuthModal]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const confirmed = window.confirm(t.postDeleteCommentConfirm || 'Delete this comment?');
    if (!confirmed) return;
    try {
      await deleteComment(commentId);
    } catch {
      // silently fail
    }
  }, [deleteComment, t]);

  const handleDeletePost = useCallback(async () => {
    const confirmed = window.confirm(t.boardDeleteConfirm || 'Delete this post? This action cannot be undone.');
    if (!confirmed) return;
    try {
      await deletePost();
      navigate(`/${lang}/board`);
    } catch {
      // silently fail
    }
  }, [deletePost, navigate, lang, t]);

  if (loading) {
    return (
      <div className="bd-page">
        <div className="bd-loading" role="status" aria-label="Loading">
          <div className="gallery-loading-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="bd-page">
        <div className="bd-not-found">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <p>{t.boardPostNotFound || 'Post not found'}</p>
          <Link to={`/${lang}/board`} className="bd-back-link">
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            {t.boardBackToList || 'Back to Board'}
          </Link>
        </div>
      </div>
    );
  }

  const displayName = post.profiles?.display_name || post.profiles?.username || 'unknown';
  const isAuthor = user?.id === post.user_id;
  const categoryLabel = CATEGORY_LABELS[lang]?.[post.category] || post.category;

  return (
    <div className="bd-page">
      <SEO
        title={`${post.title} - Spritfy Board`}
        description={post.content.slice(0, 160)}
        path={`/board/${post.id}`}
        lang={lang}
      />

      <div className="bd-nav">
        <Link to={`/${lang}/board`} className="bd-back-link">
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          {t.boardBackToList || 'Back to Board'}
        </Link>
      </div>

      <article className="bd-article">
        <div className="bd-article-header">
          <span className={`board-cat-badge cat-${post.category}`}>{categoryLabel}</span>
          <h1 className="bd-article-title">{post.title}</h1>
          <div className="bd-article-meta">
            {post.profiles?.avatar_url ? (
              <img className="bd-meta-avatar" src={post.profiles.avatar_url} alt="" />
            ) : (
              <span className="bd-meta-avatar-fallback">
                <span className="material-symbols-outlined" aria-hidden="true">person</span>
              </span>
            )}
            <span className="bd-meta-author">@{displayName}</span>
            <span className="bd-meta-sep" aria-hidden="true">&middot;</span>
            <span>{timeAgo(post.created_at, lang)}</span>
            <span className="bd-meta-sep" aria-hidden="true">&middot;</span>
            <span>{t.boardViews || 'Views'} {post.views_count}</span>
          </div>
        </div>

        <div className="bd-article-body">
          <p className="bd-article-content">{post.content}</p>

          {post.image_url && (
            <div className="bd-article-image">
              <img src={post.image_url} alt="" draggable={false} />
            </div>
          )}
        </div>

        <div className="bd-actions">
          <button
            className={`post-like-btn${isLiked ? ' liked' : ''}`}
            onClick={handleLike}
            aria-label={isLiked ? 'Unlike' : 'Like'}
            aria-pressed={isLiked}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {isLiked ? 'favorite' : 'favorite_border'}
            </span>
            {t.postLike || 'Like'} ({post.likes_count})
          </button>

          <span className="post-comments-count">
            <span className="material-symbols-outlined" aria-hidden="true">chat_bubble</span>
            {t.postComments || 'Comments'} ({post.comments_count})
          </span>

          {isAuthor && (
            <>
              <button className="post-edit-btn" onClick={() => setShowEdit(true)}>
                <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                {t.postEdit || 'Edit'}
              </button>
              <button className="post-delete-btn" onClick={handleDeletePost}>
                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                {t.postDelete || 'Delete'}
              </button>
            </>
          )}
        </div>

        <div className="post-comments-section">
          <h2 className="post-comments-title">
            {t.postComments || 'Comments'} ({comments.length})
          </h2>

          {comments.length > 0 ? (
            <ul className="post-comments-list">
              {comments.map(comment => {
                const commentAuthor = comment.profiles?.display_name || comment.profiles?.username || 'unknown';
                const isCommentAuthor = user?.id === comment.user_id;

                return (
                  <li key={comment.id} className="post-comment">
                    <div className="post-comment-header">
                      {comment.profiles?.avatar_url ? (
                        <img className="post-comment-avatar" src={comment.profiles.avatar_url} alt="" />
                      ) : (
                        <span className="post-comment-avatar-fallback">
                          <span className="material-symbols-outlined" aria-hidden="true">person</span>
                        </span>
                      )}
                      <span className="post-comment-author">@{commentAuthor}</span>
                      <span className="post-comment-date">{timeAgo(comment.created_at, lang)}</span>
                      {isCommentAuthor && (
                        <button
                          className="post-comment-delete"
                          onClick={() => handleDeleteComment(comment.id)}
                          aria-label="Delete comment"
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">close</span>
                        </button>
                      )}
                    </div>
                    <p className="post-comment-content">{comment.content}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="post-no-comments">{t.postNoComments || 'No comments yet'}</p>
          )}

          <form className="post-comment-form" onSubmit={handleCommentSubmit}>
            <input
              type="text"
              className="post-comment-input"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder={user ? (t.postCommentPlaceholder || 'Write a comment...') : (t.postLoginToComment || 'Log in to comment')}
              maxLength={500}
              disabled={!user}
            />
            <button
              type="submit"
              className="post-comment-submit pixel-btn pixel-btn-primary"
              disabled={!user || !commentText.trim() || commentSubmitting}
            >
              {commentSubmitting ? (
                <span className="upload-spinner" />
              ) : (
                <span className="material-symbols-outlined" aria-hidden="true">send</span>
              )}
            </button>
          </form>

          {commentError && (
            <div className="upload-error" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              {commentError}
            </div>
          )}
        </div>
      </article>

      <Footer lang={lang} t={t} />

      {showEdit && post && (
        <BoardEditModal
          post={post}
          lang={lang}
          t={t}
          onClose={() => setShowEdit(false)}
          onSave={async (fields) => {
            await updatePost(fields);
            setShowEdit(false);
          }}
        />
      )}
    </div>
  );
};
