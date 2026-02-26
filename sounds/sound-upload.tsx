import React, { useState, useRef, useCallback } from 'react';
import type { Lang } from '@/i18n.ts';
import { useAuth } from '@/auth/auth-context.tsx';
import { supabase } from '@/lib/supabase.ts';
import { uploadAudioToR2, UploadError } from '@/lib/r2-upload.ts';
import type { SoundCategory, SoundFormat } from '@/sounds/types.ts';
import '@/gallery/upload-form.css';

interface SoundUploadFormProps {
  lang: Lang;
  t: Record<string, string>;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_OPTIONS: { value: SoundCategory; i18nKey: string }[] = [
  { value: 'bgm', i18nKey: 'soundCatBgm' },
  { value: 'sfx', i18nKey: 'soundCatSfx' },
  { value: 'ui', i18nKey: 'soundCatUi' },
  { value: 'ambient', i18nKey: 'soundCatAmbient' },
  { value: 'voice', i18nKey: 'soundCatVoice' },
];

const ALLOWED_TYPES: Record<string, SoundFormat> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve(audio.duration || 0);
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(audio.src);
    };
    audio.src = URL.createObjectURL(file);
  });
}

export const SoundUploadForm: React.FC<SoundUploadFormProps> = ({ lang, t, onClose, onSuccess }) => {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [categoryVal, setCategoryVal] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = useCallback((selectedFile: File) => {
    const format = ALLOWED_TYPES[selectedFile.type];
    if (!format) {
      setErrorMsg(t.soundErrFileType || 'Unsupported format. (MP3, WAV, OGG, FLAC)');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMsg(t.soundErrTooLarge || 'File is too large (max 10MB).');
      return;
    }
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setErrorMsg('');
    if (!title.trim()) {
      setTitle(selectedFile.name.replace(/\.[^.]+$/, ''));
    }
  }, [t, title]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const handleOverlayMouseDown = (e: React.MouseEvent) => { mouseDownTarget.current = e.target; };
  const handleOverlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose(); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !session?.access_token) return;
    if (!title.trim()) { setErrorMsg(t.uploadTitleRequired || 'Title is required'); return; }
    if (!categoryVal) { setErrorMsg(t.soundCategoryRequired || 'Category is required'); return; }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const duration = await getAudioDuration(file);
      const { audioUrl } = await uploadAudioToR2(file, session.access_token);
      const format = ALLOWED_TYPES[file.type] || 'mp3';
      const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

      const { error: insertError } = await supabase.from('sounds').insert({
        user_id: session.user.id,
        title: title.trim(),
        description: description.trim() || null,
        audio_url: audioUrl,
        duration,
        file_size: file.size,
        format,
        category: categoryVal as SoundCategory,
        tags,
      });

      if (insertError) throw insertError;
      onSuccess();
    } catch (err) {
      if (err instanceof UploadError) {
        switch (err.status) {
          case 401: setErrorMsg(t.uploadErrAuth || 'Login expired.'); break;
          case 413: setErrorMsg(t.soundErrTooLarge || 'File is too large (max 10MB).'); break;
          default: setErrorMsg(t.uploadErrServer || 'Server error.');
        }
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(t.soundUploadError || 'Upload failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="upload-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-label={t.soundUpload || 'Upload Sound'}>
      <div className="upload-modal pixel-border">
        <div className="upload-modal-header">
          <h2 className="upload-modal-title">{t.soundUpload || 'Upload Sound'}</h2>
          <button className="upload-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          {!file ? (
            <button type="button" className="upload-drop-zone" onClick={() => fileInputRef.current?.click()} style={{ padding: '28px 16px' }}>
              <span className="material-symbols-outlined upload-drop-icon" aria-hidden="true">audio_file</span>
              <p className="upload-drop-text">{t.soundDropHint || 'Click to select audio file'}</p>
              <p className="upload-drop-sub">MP3, WAV, OGG, FLAC (max 10MB)</p>
            </button>
          ) : (
            <div className="upload-preview" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 32, color: 'var(--primary)' }}>audio_file</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
              </div>
              <button type="button" className="upload-preview-change" onClick={() => { setFile(null); setFileName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
                {t.soundChangeFile || 'Change'}
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/flac" onChange={handleFileChange} className="hidden-input" aria-hidden="true" />

          <label className="upload-label">
            <span>{t.soundCategoryLabel || 'Category'} *</span>
            <select className="upload-select" value={categoryVal} onChange={e => setCategoryVal(e.target.value)} required>
              <option value="" disabled>{t.soundCategorySelect || '-- Select --'}</option>
              {CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{t[opt.i18nKey] || opt.value}</option>)}
            </select>
          </label>

          <label className="upload-label">
            <span>{t.uploadTitleLabel || 'Title'} *</span>
            <input type="text" className="upload-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} required placeholder={t.soundTitlePlaceholder || 'Sound title'} />
          </label>

          <label className="upload-label">
            <span>{t.uploadDescLabel || 'Description'}</span>
            <textarea className="upload-textarea" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} placeholder={t.soundDescPlaceholder || 'Describe your sound (optional)'} />
          </label>

          <label className="upload-label">
            <span>{t.uploadTagsLabel || 'Tags'}</span>
            <input type="text" className="upload-input" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder={t.uploadTagsPlaceholder || 'tag1, tag2, tag3'} />
          </label>

          {errorMsg && <div className="upload-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error</span>{errorMsg}</div>}

          <button type="submit" className="upload-submit-btn pixel-btn pixel-btn-primary" disabled={!file || !title.trim() || !categoryVal || submitting}>
            {submitting ? (<><span className="upload-spinner" />{t.soundSubmitting || 'Uploading...'}</>) : (<><span className="material-symbols-outlined" aria-hidden="true">upload</span>{t.soundSubmit || 'Upload'}</>)}
          </button>
        </form>
      </div>
    </div>
  );
};
