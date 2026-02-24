import React, { useState, useRef, useCallback } from 'react';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { supabase } from '@/lib/supabase.ts';
import { generateThumbnail, getImageDimensions } from '@/lib/image-utils.ts';
import { uploadToR2, UploadError } from '@/lib/r2-upload.ts';
import type { Post } from '@/gallery/types.ts';
import '@/gallery/upload-form.css';

interface UploadFormProps {
  lang: Lang;
  t: Record<string, string>;
  onClose: () => void;
  onSuccess: () => void;
}

type ToolType = Post['tool_type'];

const TOOL_OPTIONS: { value: ToolType; i18nKey: string }[] = [
  { value: 'character_human', i18nKey: 'catCharHuman' },
  { value: 'character_monster', i18nKey: 'catCharMonster' },
  { value: 'character_animal', i18nKey: 'catCharAnimal' },
  { value: 'effect', i18nKey: 'catEffect' },
  { value: 'ui', i18nKey: 'catUI' },
  { value: 'tile_map', i18nKey: 'catTileMap' },
  { value: 'item', i18nKey: 'catItem' },
  { value: 'icon', i18nKey: 'catIcon' },
  { value: 'background', i18nKey: 'catBackground' },
  { value: 'other', i18nKey: 'catOther' },
];

export const UploadForm: React.FC<UploadFormProps> = ({ lang, t, onClose, onSuccess }) => {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [toolType, setToolType] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback((selectedFile: File) => {
    const allowedTypes = ['image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setErrorMsg(t.uploadErrFileType || 'Unsupported file type. (PNG, GIF, WebP)');
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(1);
      setErrorMsg(
        (t.uploadErrTooLarge || 'File is too large (max 5MB).') + ` (${sizeMB}MB)`
      );
      return;
    }
    setFile(selectedFile);
    setErrorMsg('');

    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
  }, [t]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
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

    if (!file || !session?.access_token) return;
    if (!title.trim()) {
      setErrorMsg(t.uploadTitleRequired || 'Title is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const thumbnail = await generateThumbnail(file);
      const dimensions = await getImageDimensions(file);
      const { imageUrl, thumbnailUrl } = await uploadToR2(file, thumbnail, session.access_token);

      const tags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const formatMap: Record<string, Post['format']> = {
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };

      const { error: insertError } = await supabase.from('posts').insert({
        user_id: session.user.id,
        title: title.trim(),
        description: description.trim() || null,
        image_url: imageUrl,
        thumbnail_url: thumbnailUrl,
        width: dimensions.width,
        height: dimensions.height,
        file_size: file.size,
        format: formatMap[file.type] || 'png',
        tags,
        tool_type: toolType as ToolType,
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
          case 415:
            setErrorMsg(t.uploadErrFileType || 'Unsupported file type. (PNG, GIF, WebP)');
            break;
          default:
            setErrorMsg(t.uploadErrServer || 'Server error. Please try again later.');
        }
      } else if (err instanceof Error) {
        if (err.message.includes('Thumbnail') || err.message.includes('thumbnail')) {
          setErrorMsg(t.uploadErrThumbnail || 'Failed to generate thumbnail. The image may be too large.');
        } else if (err.message.includes('load image')) {
          setErrorMsg(t.uploadErrLoadImage || 'Failed to load image. The file may be corrupted.');
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setErrorMsg(t.uploadErrNetwork || 'Network error. Check your connection and try again.');
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg(t.uploadError || 'Upload failed');
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
      aria-label={t.galleryUpload || 'Upload'}
    >
      <div className="upload-modal pixel-border">
        <div className="upload-modal-header">
          <h2 className="upload-modal-title">{t.galleryUpload || 'Upload'}</h2>
          <button className="upload-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          {/* Drop zone */}
          {!preview ? (
            <div
              className={`upload-drop-zone${isDragOver ? ' drag-over' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              role="button"
              tabIndex={0}
              aria-label={t.uploadDropHint || 'Click or drag to upload image'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <span className="material-symbols-outlined upload-drop-icon" aria-hidden="true">cloud_upload</span>
              <p className="upload-drop-text">{t.uploadDropHint || 'Click or drag to upload image'}</p>
              <p className="upload-drop-sub">PNG, GIF, WebP (max 5MB)</p>
            </div>
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
                <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
                {t.uploadChangeFile || 'Change file'}
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
              placeholder={t.uploadTitlePlaceholder || 'Give your work a title'}
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
              placeholder={t.uploadDescPlaceholder || 'Describe your work (optional)'}
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
              onChange={e => setToolType(e.target.value)}
              required
            >
              <option value="" disabled>
                {t.uploadToolPlaceholder || '-- Select --'}
              </option>
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
            disabled={!file || !title.trim() || !toolType || submitting}
          >
            {submitting ? (
              <>
                <span className="upload-spinner" />
                {t.uploadSubmitting || 'Uploading...'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" aria-hidden="true">upload</span>
                {t.uploadSubmit || 'Upload'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
