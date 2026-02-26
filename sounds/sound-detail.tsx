import React, { useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { useSoundDetail } from '@/sounds/use-sound-detail.ts';
import { SoundEditModal } from '@/sounds/sound-edit-modal.tsx';
import { AudioPlayer } from '@/sounds/audio-player.tsx';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import '@/sounds/sound-detail.css';
import '@/gallery/post-detail.css';

interface SoundDetailProps {
  lang: Lang;
  t: Record<string, string>;
}

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (lang === 'ko') {
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 30) return `${days}일 전`;
    return new Date(dateStr).toLocaleDateString('ko-KR');
  }
  if (lang === 'ja') {
    if (mins < 1) return 'たった今';
    if (mins < 60) return `${mins}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 30) return `${days}日前`;
    return new Date(dateStr).toLocaleDateString('ja-JP');
  }
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  ko: { bgm: 'BGM', sfx: '효과음', ui: 'UI 사운드', ambient: '환경음', voice: '보이스' },
  en: { bgm: 'BGM', sfx: 'SFX', ui: 'UI Sound', ambient: 'Ambient', voice: 'Voice' },
  ja: { bgm: 'BGM', sfx: '効果音', ui: 'UIサウンド', ambient: '環境音', voice: 'ボイス' },
};

export const SoundDetailPage: React.FC<SoundDetailProps> = ({ lang, t }) => {
  const { soundId } = useParams<{ soundId: string }>();
  const navigate = useNavigate();
  const { user, setShowAuthModal } = useAuth();

  const { sound, comments, isLiked, loading, toggleLike, addComment, deleteComment, deleteSound, updateSound } = useSoundDetail(soundId ?? '', user?.id);

  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  const handleLike = useCallback(async () => {
    if (!user) { setShowAuthModal(true); return; }
    try { await toggleLike(); } catch { /* handled */ }
  }, [user, toggleLike, setShowAuthModal]);

  const handleCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setShowAuthModal(true); return; }
    if (!commentText.trim()) return;
    setCommentSubmitting(true);
    setCommentError('');
    try { await addComment(commentText); setCommentText(''); }
    catch (err) { setCommentError(err instanceof Error ? err.message : 'Failed'); }
    finally { setCommentSubmitting(false); }
  }, [user, commentText, addComment, setShowAuthModal]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!window.confirm(t.postDeleteCommentConfirm || 'Delete this comment?')) return;
    try { await deleteComment(commentId); } catch { /* */ }
  }, [deleteComment, t]);

  const handleDeleteSound = useCallback(async () => {
    if (!window.confirm(t.soundDeleteConfirm || 'Delete this sound?')) return;
    try { await deleteSound(); navigate(`/${lang}/sounds`); } catch { /* */ }
  }, [deleteSound, navigate, lang, t]);

  if (loading) {
    return <div className="sd-page"><div className="sd-loading" role="status"><div className="gallery-loading-dots"><span /><span /><span /></div></div></div>;
  }

  if (!sound) {
    return (
      <div className="sd-page">
        <div className="sd-not-found">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <p>{t.soundNotFound || 'Sound not found'}</p>
          <Link to={`/${lang}/sounds`} className="sd-back-link">
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            {t.soundBackToList || 'Back to Sounds'}
          </Link>
        </div>
      </div>
    );
  }

  const displayName = sound.profiles?.display_name || sound.profiles?.username || 'unknown';
  const isAuthor = user?.id === sound.user_id;
  const categoryLabel = CATEGORY_LABELS[lang]?.[sound.category] || sound.category;

  return (
    <div className="sd-page">
      <SEO title={`${sound.title} - Spritfy Sounds`} description={sound.description || sound.title} path={`/sounds/${sound.id}`} lang={lang} />

      <div className="sd-nav">
        <Link to={`/${lang}/sounds`} className="sd-back-link">
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          {t.soundBackToList || 'Back to Sounds'}
        </Link>
      </div>

      <article className="sd-article">
        <div className="sd-article-header">
          <span className={`sound-cat-badge cat-${sound.category}`}>{categoryLabel}</span>
          <h1 className="sd-article-title">{sound.title}</h1>
          <div className="sd-article-meta">
            {sound.profiles?.avatar_url ? (
              <img className="sd-meta-avatar" src={sound.profiles.avatar_url} alt="" />
            ) : (
              <span className="sd-meta-avatar-fallback"><span className="material-symbols-outlined" aria-hidden="true">person</span></span>
            )}
            <span className="sd-meta-author">@{displayName}</span>
            <span className="sd-meta-sep" aria-hidden="true">&middot;</span>
            <span>{timeAgo(sound.created_at, lang)}</span>
          </div>
        </div>

        <AudioPlayer src={sound.audio_url} />

        <div className="sd-file-info">
          <span>{sound.format.toUpperCase()}</span>
          <span className="sd-meta-sep" aria-hidden="true">&middot;</span>
          <span>{formatFileSize(sound.file_size)}</span>
          <span className="sd-meta-sep" aria-hidden="true">&middot;</span>
          <span>{formatDuration(sound.duration)}</span>
        </div>

        {sound.description && <p className="sd-article-desc">{sound.description}</p>}

        {sound.tags && sound.tags.length > 0 && (
          <div className="sd-tags">
            {sound.tags.map(tag => <span key={tag} className="sd-tag">#{tag}</span>)}
          </div>
        )}

        <div className="sd-actions">
          <button className={`post-like-btn${isLiked ? ' liked' : ''}`} onClick={handleLike} aria-label={isLiked ? 'Unlike' : 'Like'} aria-pressed={isLiked}>
            <span className="material-symbols-outlined" aria-hidden="true">{isLiked ? 'favorite' : 'favorite_border'}</span>
            {t.postLike || 'Like'} ({sound.likes_count})
          </button>
          <span className="post-comments-count">
            <span className="material-symbols-outlined" aria-hidden="true">chat_bubble</span>
            {t.postComments || 'Comments'} ({sound.comments_count})
          </span>
          {isAuthor && (
            <>
              <button className="post-edit-btn" onClick={() => setShowEdit(true)}>
                <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                {t.postEdit || 'Edit'}
              </button>
              <button className="post-delete-btn" onClick={handleDeleteSound}>
                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                {t.postDelete || 'Delete'}
              </button>
            </>
          )}
        </div>

        <div className="post-comments-section">
          <h2 className="post-comments-title">{t.postComments || 'Comments'} ({comments.length})</h2>
          {comments.length > 0 ? (
            <ul className="post-comments-list">
              {comments.map(c => {
                const cAuthor = c.profiles?.display_name || c.profiles?.username || 'unknown';
                return (
                  <li key={c.id} className="post-comment">
                    <div className="post-comment-header">
                      {c.profiles?.avatar_url ? <img className="post-comment-avatar" src={c.profiles.avatar_url} alt="" /> : <span className="post-comment-avatar-fallback"><span className="material-symbols-outlined" aria-hidden="true">person</span></span>}
                      <span className="post-comment-author">@{cAuthor}</span>
                      <span className="post-comment-date">{timeAgo(c.created_at, lang)}</span>
                      {user?.id === c.user_id && <button className="post-comment-delete" onClick={() => handleDeleteComment(c.id)} aria-label="Delete comment"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
                    </div>
                    <p className="post-comment-content">{c.content}</p>
                  </li>
                );
              })}
            </ul>
          ) : <p className="post-no-comments">{t.postNoComments || 'No comments yet'}</p>}

          <form className="post-comment-form" onSubmit={handleCommentSubmit}>
            <input type="text" className="post-comment-input" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder={user ? (t.postCommentPlaceholder || 'Write a comment...') : (t.postLoginToComment || 'Log in to comment')} maxLength={500} disabled={!user} />
            <button type="submit" className="post-comment-submit pixel-btn pixel-btn-primary" disabled={!user || !commentText.trim() || commentSubmitting}>
              {commentSubmitting ? <span className="upload-spinner" /> : <span className="material-symbols-outlined" aria-hidden="true">send</span>}
            </button>
          </form>
          {commentError && <div className="upload-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error</span>{commentError}</div>}
        </div>
      </article>

      <Footer lang={lang} t={t} />
      {showEdit && sound && <SoundEditModal sound={sound} lang={lang} t={t} onClose={() => setShowEdit(false)} onSave={async (fields) => { await updateSound(fields); setShowEdit(false); }} />}
    </div>
  );
};
