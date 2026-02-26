import React, { useState, useRef } from 'react';
import type { Lang } from '@/i18n.ts';
import type { BoardPost, BoardCategory } from '@/board/types.ts';
import '@/gallery/upload-form.css';

interface BoardEditModalProps {
  post: BoardPost;
  lang: Lang;
  t: Record<string, string>;
  onClose: () => void;
  onSave: (fields: { title: string; content: string; category: BoardCategory }) => Promise<void>;
}

const CATEGORY_OPTIONS: { value: BoardCategory; i18nKey: string }[] = [
  { value: 'free', i18nKey: 'boardCatFree' },
  { value: 'question', i18nKey: 'boardCatQuestion' },
  { value: 'tips', i18nKey: 'boardCatTips' },
  { value: 'showcase', i18nKey: 'boardCatShowcase' },
  { value: 'bug', i18nKey: 'boardCatBug' },
];

export const BoardEditModal: React.FC<BoardEditModalProps> = ({ post, lang, t, onClose, onSave }) => {
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [categoryVal, setCategoryVal] = useState<BoardCategory>(post.category);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setErrorMsg(t.uploadTitleRequired || 'Title is required');
      return;
    }
    if (!content.trim()) {
      setErrorMsg(t.boardContentRequired || 'Content is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      await onSave({
        title: title.trim(),
        content: content.trim(),
        category: categoryVal,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="upload-overlay"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t.postEditTitle || 'Edit Post'}
    >
      <div className="upload-modal pixel-border">
        <div className="upload-modal-header">
          <h2 className="upload-modal-title">{t.postEditTitle || 'Edit Post'}</h2>
          <button className="upload-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          {/* Category */}
          <label className="upload-label">
            <span>{t.boardThCategory || 'Category'}</span>
            <select
              className="upload-select"
              value={categoryVal}
              onChange={e => setCategoryVal(e.target.value as BoardCategory)}
            >
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {t[opt.i18nKey] || opt.value}
                </option>
              ))}
            </select>
          </label>

          {/* Title */}
          <label className="upload-label">
            <span>{t.uploadTitleLabel || 'Title'} *</span>
            <input
              type="text"
              className="upload-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={100}
              required
            />
          </label>

          {/* Content */}
          <label className="upload-label">
            <span>{t.boardContentLabel || 'Content'} *</span>
            <textarea
              className="upload-textarea"
              value={content}
              onChange={e => setContent(e.target.value)}
              maxLength={5000}
              rows={8}
              required
              style={{ minHeight: 160 }}
            />
          </label>

          {errorMsg && (
            <div className="upload-error" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="upload-submit-btn pixel-btn pixel-btn-primary"
            disabled={!title.trim() || !content.trim() || submitting}
          >
            {submitting ? (
              <>
                <span className="upload-spinner" />
                {t.postEditSaving || 'Saving...'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" aria-hidden="true">save</span>
                {t.postEditSave || 'Save'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
