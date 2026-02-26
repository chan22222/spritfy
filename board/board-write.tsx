import React, { useState, useRef, useCallback } from 'react';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { supabase } from '@/lib/supabase.ts';
import { generateThumbnail } from '@/lib/image-utils.ts';
import { uploadToR2, UploadError } from '@/lib/r2-upload.ts';
import type { BoardCategory } from '@/board/types.ts';
import '@/gallery/upload-form.css';

interface BoardWriteFormProps {
  lang: Lang;
  t: Record<string, string>;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_OPTIONS: { value: BoardCategory; i18nKey: string }[] = [
  { value: 'free', i18nKey: 'boardCatFree' },
  { value: 'question', i18nKey: 'boardCatQuestion' },
  { value: 'tips', i18nKey: 'boardCatTips' },
  { value: 'showcase', i18nKey: 'boardCatShowcase' },
  { value: 'bug', i18nKey: 'boardCatBug' },
];

export const BoardWriteForm: React.FC<BoardWriteFormProps> = ({ lang, t, onClose, onSuccess }) => {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryVal, setCategoryVal] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = useCallback((selectedFile: File) => {
    const allowedTypes = ['image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setErrorMsg(t.uploadErrFileType || 'Unsupported file type. (PNG, GIF, WebP)');
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setErrorMsg(t.uploadErrTooLarge || 'File is too large (max 5MB).');
      return;
    }
    setFile(selectedFile);
    setErrorMsg('');
    setPreview(URL.createObjectURL(selectedFile));
  }, [t]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

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
    if (!session?.access_token) return;
    if (!title.trim()) {
      setErrorMsg(t.uploadTitleRequired || 'Title is required');
      return;
    }
    if (!content.trim()) {
      setErrorMsg(t.boardContentRequired || 'Content is required');
      return;
    }
    if (!categoryVal) {
      setErrorMsg(t.boardCategoryRequired || 'Category is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      let imageUrl: string | null = null;
      let thumbnailUrl: string | null = null;

      if (file) {
        const thumbnail = await generateThumbnail(file);
        const uploaded = await uploadToR2(file, thumbnail, session.access_token);
        imageUrl = uploaded.imageUrl;
        thumbnailUrl = uploaded.thumbnailUrl;
      }

      const { error: insertError } = await supabase.from('board_posts').insert({
        user_id: session.user.id,
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl,
        thumbnail_url: thumbnailUrl,
        category: categoryVal as BoardCategory,
        lang,
      });

      if (insertError) throw insertError;

      onSuccess();
    } catch (err) {
      if (err instanceof UploadError) {
        switch (err.status) {
          case 401:
            setErrorMsg(t.uploadErrAuth || 'Login expired. Please log in again.');
            break;
          case 413:
            setErrorMsg(t.uploadErrTooLarge || 'File is too large (max 5MB).');
            break;
          default:
            setErrorMsg(t.uploadErrServer || 'Server error. Please try again later.');
        }
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(t.boardWriteError || 'Failed to create post');
      }
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
      aria-label={t.boardWrite || 'Write'}
    >
      <div className="upload-modal pixel-border">
        <div className="upload-modal-header">
          <h2 className="upload-modal-title">{t.boardWrite || 'Write'}</h2>
          <button className="upload-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          {/* Category */}
          <label className="upload-label">
            <span>{t.boardThCategory || 'Category'} *</span>
            <select
              className="upload-select"
              value={categoryVal}
              onChange={e => setCategoryVal(e.target.value)}
              required
            >
              <option value="" disabled>
                {t.boardCategorySelect || '-- Select --'}
              </option>
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
              placeholder={t.boardTitlePlaceholder || 'Enter title'}
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
              placeholder={t.boardContentPlaceholder || 'Write your post...'}
              style={{ minHeight: 160 }}
            />
          </label>

          {/* Image (optional) */}
          <label className="upload-label">
            <span>{t.boardImageLabel || 'Image (optional)'}</span>
          </label>
          {!preview ? (
            <button
              type="button"
              className="upload-drop-zone"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '20px 16px' }}
            >
              <span className="material-symbols-outlined upload-drop-icon" aria-hidden="true" style={{ fontSize: 28 }}>add_photo_alternate</span>
              <p className="upload-drop-sub" style={{ margin: 0 }}>PNG, GIF, WebP (max 5MB)</p>
            </button>
          ) : (
            <div className="upload-preview">
              <img src={preview} alt="Preview" />
              <button
                type="button"
                className="upload-preview-change"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
                {t.boardRemoveImage || 'Remove'}
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/gif,image/webp"
            onChange={handleFileChange}
            className="hidden-input"
            aria-hidden="true"
          />

          {errorMsg && (
            <div className="upload-error" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="upload-submit-btn pixel-btn pixel-btn-primary"
            disabled={!title.trim() || !content.trim() || !categoryVal || submitting}
          >
            {submitting ? (
              <>
                <span className="upload-spinner" />
                {t.boardSubmitting || 'Posting...'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" aria-hidden="true">send</span>
                {t.boardSubmit || 'Post'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
