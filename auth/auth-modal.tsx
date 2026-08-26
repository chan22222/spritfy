import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/auth/auth-context.tsx';
import { useLang } from '@/lang-context.ts';
import '@/auth/auth-modal.css';

export const AuthModal: React.FC = () => {
  const { showAuthModal, setShowAuthModal, signInWithGoogle, signInWithGithub } = useAuth();
  const { t } = useLang();

  const [error, setError] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (showAuthModal) {
      setError('');
    }
  }, [showAuthModal]);

  // Focus trap
  useEffect(() => {
    if (!showAuthModal) return;

    // 모달을 연 요소를 기억해 두었다가 닫을 때 포커스를 되돌린다
    const opener = document.activeElement as HTMLElement | null;

    // Focus the first element
    firstFocusRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAuthModal(false);
        return;
      }

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
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [showAuthModal, setShowAuthModal]);

  if (!showAuthModal) return null;

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
      setShowAuthModal(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    setError('');
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithGithub();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  };

  return (
    <div className="auth-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="auth-modal" ref={modalRef}>
        <button
          className="auth-close"
          onClick={() => setShowAuthModal(false)}
          aria-label={t.close}
          ref={firstFocusRef}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>close</span>
        </button>

        <h2 className="auth-title" id="auth-modal-title">{t.authLogin}</h2>

        {/* Social Login */}
        <button
          className="auth-social-btn"
          onClick={() => handleSocialLogin('google')}
          type="button"
        >
          Google
          <span style={{ flex: 1, textAlign: 'center' }}>{t.authContinueGoogle}</span>
        </button>

        <button
          className="auth-social-btn"
          onClick={() => handleSocialLogin('github')}
          type="button"
        >
          GitHub
          <span style={{ flex: 1, textAlign: 'center' }}>{t.authContinueGithub}</span>
        </button>

        {error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  );
};
