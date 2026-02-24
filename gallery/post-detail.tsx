import React, { useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { usePostDetail } from '@/gallery/use-post-detail.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import '@/gallery/post-detail.css';

interface PostDetailProps {
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

const TOOL_LABELS: Record<string, Record<string, string>> = {
  ko: { editor: '\uC5D0\uB514\uD130', sprite: '\uC2A4\uD504\uB77C\uC774\uD2B8', converter: '\uBCC0\uD658\uAE30', external: '\uC678\uBD80' },
  en: { editor: 'Editor', sprite: 'Sprite', converter: 'Converter', external: 'External' },
  ja: { editor: '\u30A8\u30C7\u30A3\u30BF\u30FC', sprite: '\u30B9\u30D7\u30E9\u30A4\u30C8', converter: '\u30B3\u30F3\u30D0\u30FC\u30BF\u30FC', external: '\u5916\u90E8' },
};

export const PostDetailPage: React.FC<PostDetailProps> = ({ lang, t }) => {
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
  } = usePostDetail(postId ?? '', user?.id);

  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');

  const handleLike = useCallback(async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    try {
      await toggleLike();
    } catch {
      // Error handled in hook
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
      // Silently fail
    }
  }, [deleteComment, t]);

  const handleDeletePost = useCallback(async () => {
    const confirmed = window.confirm(t.postDeleteConfirm || 'Delete this post? This action cannot be undone.');
    if (!confirmed) return;
    try {
      await deletePost();
      navigate(`/${lang}/gallery`);
    } catch {
      // Silently fail
    }
  }, [deletePost, navigate, lang, t]);

  if (loading) {
    return (
      <div className="post-detail-page">
        <div className="post-detail-loading" role="status" aria-label="Loading">
          <div className="gallery-loading-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="post-detail-page">
        <div className="post-detail-not-found">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <p>{t.postNotFound || 'Post not found'}</p>
          <Link to={`/${lang}/gallery`} className="post-back-link">
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            {t.postBackToGallery || 'Back to Gallery'}
          </Link>
        </div>
      </div>
    );
  }

  const displayName = post.profiles?.display_name || post.profiles?.username || 'unknown';
  const isAuthor = user?.id === post.user_id;
  const toolLabel = TOOL_LABELS[lang]?.[post.tool_type] || post.tool_type;

  return (
    <div className="post-detail-page">
      <SEO
        title={`${post.title} - Spritfy Gallery`}
        description={post.description || post.title}
        path={`/gallery/${post.id}`}
        lang={lang}
      />

      {/* Back link */}
      <div className="post-detail-nav">
        <Link to={`/${lang}/gallery`} className="post-back-link">
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          {t.postBackToGallery || 'Back to Gallery'}
        </Link>
      </div>

      {/* Image */}
      <div className="post-image-container">
        <img
          className="post-image"
          src={post.image_url}
          alt={post.title}
          draggable={false}
        />
      </div>

      {/* Info */}
      <div className="post-detail-content">
        <h1 className="post-detail-title">{post.title}</h1>

        <div className="post-meta">
          <span className="post-meta-author">@{displayName}</span>
          <span className="post-meta-sep" aria-hidden="true">·</span>
          <span>{timeAgo(post.created_at, lang)}</span>
          <span className="post-meta-sep" aria-hidden="true">·</span>
          <span className="post-meta-tool">{toolLabel}</span>
          {post.width && post.height && (
            <>
              <span className="post-meta-sep" aria-hidden="true">·</span>
              <span>{post.width}x{post.height}</span>
            </>
          )}
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="post-tags">
            {post.tags.map((tag, i) => (
              <span key={i} className="post-tag">#{tag}</span>
            ))}
          </div>
        )}

        {/* Description */}
        {post.description && (
          <p className="post-description">{post.description}</p>
        )}

        {/* Actions */}
        <div className="post-actions">
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
            <button className="post-delete-btn" onClick={handleDeletePost}>
              <span className="material-symbols-outlined" aria-hidden="true">delete</span>
              {t.postDelete || 'Delete'}
            </button>
          )}
        </div>

        {/* Comments Section */}
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

          {/* Comment Form */}
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
      </div>

      {/* Footer */}
      <Footer lang={lang} t={t} />
    </div>
  );
};
