import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/auth/auth-context.tsx';
import { useLang } from '@/lang-context.ts';
import { supabase } from '@/lib/supabase.ts';
import { uploadAvatarToR2 } from '@/lib/r2-upload.ts';
import { validateAvatarImage, generateAvatarThumbnail } from '@/lib/image-utils.ts';
import '@/auth/profile-modal.css';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ open, onClose }) => {
  const { user, session, refreshUser } = useAuth();
  const { t } = useLang();
  const modalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setError('');
    setAvatarFile(null);
    setAvatarPreview(null);
    setUsernameError('');

    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data, error: fetchErr }) => {
        if (fetchErr || !data) {
          setError(fetchErr?.message || 'Failed to load profile');
          setLoading(false);
          return;
        }
        setDisplayName(data.display_name || '');
        setUsername(data.username || '');
        setOriginalUsername(data.username || '');
        setAvatarUrl(data.avatar_url || null);
        setLoading(false);
      });
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    firstFocusRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    if (!username.trim() || username === originalUsername) {
      setUsernameError('');
      setUsernameChecking(false);
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameError(t.profileUsernameInvalid || 'Only letters, numbers, and underscores');
      return;
    }

    setUsernameChecking(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.toLowerCase())
          .neq('id', user?.id ?? '')
          .maybeSingle();

        setUsernameError(data ? (t.profileUsernameExists || 'Username already taken') : '');
      } catch {
        setUsernameError('');
      } finally {
        setUsernameChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, originalUsername, user, t]);

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAvatarImage(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError('');
  }, [avatarPreview]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !session?.access_token) return;

    if (!displayName.trim()) {
      setError(t.profileDisplayNameRequired || 'Display name is required');
      return;
    }
    if (!username.trim()) {
      setError(t.profileUsernameRequired || 'Username is required');
      return;
    }
    if (usernameError) return;

    setSubmitting(true);
    setError('');

    try {
      let newAvatarUrl = avatarUrl;

      if (avatarFile) {
        const blob = await generateAvatarThumbnail(avatarFile, 128);
        newAvatarUrl = await uploadAvatarToR2(blob, user.id, session.access_token);
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase(),
          avatar_url: newAvatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateErr) throw updateErr;

      await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim(),
          avatar_url: newAvatarUrl,
        },
      });

      await refreshUser();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSubmitting(false);
    }
  }, [user, session, displayName, username, usernameError, avatarUrl, avatarFile, refreshUser, onClose, t]);

  if (!open) return null;

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose();
  };

  const currentAvatar = avatarPreview || avatarUrl;

  return (
    <div className="profile-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label={t.profileEditTitle || 'Edit Profile'}>
      <div className="profile-modal pixel-border" ref={modalRef}>
        <div className="profile-modal-header">
          <h2 className="profile-modal-title">{t.profileEditTitle || 'Edit Profile'}</h2>
          <button className="profile-close-btn" onClick={onClose} aria-label="Close" ref={firstFocusRef}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        {loading ? (
          <div className="profile-loading">
            <div className="gallery-loading-dots"><span /><span /><span /></div>
          </div>
        ) : (
          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="profile-avatar-section">
              <div
                className="profile-avatar-wrapper"
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label={t.profileAvatarHint || 'Click to change avatar'}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              >
                {currentAvatar ? (
                  <img src={currentAvatar} alt="Avatar" />
                ) : (
                  <span className="profile-avatar-fallback">
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 48 }}>person</span>
                  </span>
                )}
                <div className="profile-avatar-edit">
                  <span className="material-symbols-outlined" aria-hidden="true">photo_camera</span>
                </div>
              </div>
              <p className="profile-avatar-hint">{t.profileAvatarHint || 'Click to change avatar (PNG, JPG, WebP, max 2MB)'}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
                className="hidden-input"
                aria-hidden="true"
              />
            </div>

            <label className="profile-label">
              <span>{t.profileDisplayName || 'Display Name'}</span>
              <input
                type="text"
                className="profile-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                required
              />
            </label>

            <label className="profile-label">
              <span>{t.profileUsername || 'Username'}</span>
              <div className="profile-username-row">
                <span className="profile-username-at">@</span>
                <input
                  type="text"
                  className="profile-input profile-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  maxLength={30}
                />
                {usernameChecking && <span className="profile-username-spinner" />}
                {!usernameChecking && !usernameError && username !== originalUsername && username.trim() && (
                  <span className="material-symbols-outlined profile-username-ok" aria-hidden="true">check_circle</span>
                )}
              </div>
              {usernameError && <p className="profile-field-error">{usernameError}</p>}
            </label>

            {error && (
              <div className="profile-error" role="alert">
                <span className="material-symbols-outlined" aria-hidden="true">error</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="profile-save-btn pixel-btn pixel-btn-primary"
              disabled={submitting || !!usernameError || usernameChecking}
            >
              {submitting ? (
                <><span className="upload-spinner" />{t.profileSaving || 'Saving...'}</>
              ) : (
                <><span className="material-symbols-outlined" aria-hidden="true">save</span>{t.profileSave || 'Save'}</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
