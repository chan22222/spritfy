import React, { useState, useRef } from 'react';
import type { Lang } from '@/i18n.ts';
import type { Sound, SoundCategory } from '@/sounds/types.ts';
import '@/gallery/upload-form.css';

interface SoundEditModalProps {
  sound: Sound;
  lang: Lang;
  t: Record<string, string>;
  onClose: () => void;
  onSave: (fields: { title: string; description: string | null; tags: string[]; category: SoundCategory }) => Promise<void>;
}

const CATEGORY_OPTIONS: { value: SoundCategory; i18nKey: string }[] = [
  { value: 'bgm', i18nKey: 'soundCatBgm' },
  { value: 'sfx', i18nKey: 'soundCatSfx' },
  { value: 'ui', i18nKey: 'soundCatUi' },
  { value: 'ambient', i18nKey: 'soundCatAmbient' },
  { value: 'voice', i18nKey: 'soundCatVoice' },
];

export const SoundEditModal: React.FC<SoundEditModalProps> = ({ sound, lang, t, onClose, onSave }) => {
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [title, setTitle] = useState(sound.title);
  const [description, setDescription] = useState(sound.description || '');
  const [tagsInput, setTagsInput] = useState(sound.tags?.join(', ') || '');
  const [categoryVal, setCategoryVal] = useState<SoundCategory>(sound.category);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleOverlayMouseDown = (e: React.MouseEvent) => { mouseDownTarget.current = e.target; };
  const handleOverlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose(); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErrorMsg(t.uploadTitleRequired || 'Title is required'); return; }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        tags,
        category: categoryVal,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="upload-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-label={t.soundEditTitle || 'Edit Sound'}>
      <div className="upload-modal pixel-border">
        <div className="upload-modal-header">
          <h2 className="upload-modal-title">{t.soundEditTitle || 'Edit Sound'}</h2>
          <button className="upload-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          <div className="upload-preview" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 32, color: 'var(--primary)' }}>audio_file</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)' }}>{sound.title}</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sound.format.toUpperCase()} &middot; {(sound.file_size / (1024 * 1024)).toFixed(1)} MB</p>
            </div>
          </div>

          <label className="upload-label">
            <span>{t.soundCategoryLabel || 'Category'} *</span>
            <select className="upload-select" value={categoryVal} onChange={e => setCategoryVal(e.target.value as SoundCategory)} required>
              {CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{t[opt.i18nKey] || opt.value}</option>)}
            </select>
          </label>

          <label className="upload-label">
            <span>{t.uploadTitleLabel || 'Title'} *</span>
            <input type="text" className="upload-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} required />
          </label>

          <label className="upload-label">
            <span>{t.uploadDescLabel || 'Description'}</span>
            <textarea className="upload-textarea" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} />
          </label>

          <label className="upload-label">
            <span>{t.uploadTagsLabel || 'Tags'}</span>
            <input type="text" className="upload-input" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder={t.uploadTagsPlaceholder || 'tag1, tag2, tag3'} />
          </label>

          {errorMsg && <div className="upload-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error</span>{errorMsg}</div>}

          <button type="submit" className="upload-submit-btn pixel-btn pixel-btn-primary" disabled={!title.trim() || submitting}>
            {submitting ? (<><span className="upload-spinner" />{t.postEditSaving || 'Saving...'}</>) : (<><span className="material-symbols-outlined" aria-hidden="true">save</span>{t.postEditSave || 'Save'}</>)}
          </button>
        </form>
      </div>
    </div>
  );
};
