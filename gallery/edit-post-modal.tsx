import React, { useState, useRef } from 'react';
import type { Lang } from '@/i18n.ts';
import type { Post } from '@/gallery/types.ts';
import '@/gallery/upload-form.css';

interface EditPostModalProps {
  post: Post;
  lang: Lang;
  t: Record<string, string>;
  onClose: () => void;
  onSave: (fields: { title: string; description: string | null; tags: string[]; tool_type: Post['tool_type'] }) => Promise<void>;
}

type ToolType = Post['tool_type'];

const TOOL_OPTIONS: { value: ToolType; i18nKey: string }[] = [
  { value: 'editor', i18nKey: 'galleryFilterEditor' },
  { value: 'sprite', i18nKey: 'galleryFilterSprite' },
  { value: 'converter', i18nKey: 'galleryFilterConverter' },
  { value: 'external', i18nKey: 'galleryFilterExternal' },
];

export const EditPostModal: React.FC<EditPostModalProps> = ({ post, lang, t, onClose, onSave }) => {
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description || '');
  const [tagsInput, setTagsInput] = useState(post.tags?.join(', ') || '');
  const [toolType, setToolType] = useState<ToolType>(post.tool_type);
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

    setSubmitting(true);
    setErrorMsg('');

    try {
      const tags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        tags,
        tool_type: toolType,
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
          {/* Image preview (read-only) */}
          <div className="upload-preview">
            <img src={post.thumbnail_url || post.image_url} alt={post.title} />
          </div>

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

          {/* Description */}
          <label className="upload-label">
            <span>{t.uploadDescLabel || 'Description'}</span>
            <textarea
              className="upload-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </label>

          {/* Tags */}
          <label className="upload-label">
            <span>{t.uploadTagsLabel || 'Tags'}</span>
            <input
              type="text"
              className="upload-input"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder={t.uploadTagsPlaceholder || 'tag1, tag2, tag3'}
            />
          </label>

          {/* Tool type */}
          <label className="upload-label">
            <span>{t.uploadToolLabel || 'Tool'}</span>
            <select
              className="upload-select"
              value={toolType}
              onChange={e => setToolType(e.target.value as ToolType)}
            >
              {TOOL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {t[opt.i18nKey] || opt.value}
                </option>
              ))}
            </select>
          </label>

          {/* Error */}
          {errorMsg && (
            <div className="upload-error" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="upload-submit-btn pixel-btn pixel-btn-primary"
            disabled={!title.trim() || submitting}
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
