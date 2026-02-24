import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/auth/auth-context.tsx';
import { useLang } from '@/lang-context.ts';
import '@/auth/auth-modal.css';

type AuthTab = 'login' | 'signup';

export const AuthModal: React.FC = () => {
  const { showAuthModal, setShowAuthModal, signInWithGoogle, signInWithGithub, signInWithEmail, signUp } = useAuth();
  const { t } = useLang();

  const [tab, setTab] = useState<AuthTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (showAuthModal) {
      setTab('login');
      setEmail('');
      setPassword('');
      setError('');
      setSubmitting(false);
    }
  }, [showAuthModal]);

  // Focus trap
  useEffect(() => {
    if (!showAuthModal) return;

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
    return () => document.removeEventListener('keydown', handleKeyDown);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (tab === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUp(email, password);
      }
      setShowAuthModal(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSubmitting(false);
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
    <div className="auth-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label={t.authLogin}>
      <div className="auth-modal" ref={modalRef}>
        <button
          className="auth-close"
          onClick={() => setShowAuthModal(false)}
          aria-label="Close"
          ref={firstFocusRef}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>close</span>
        </button>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab${tab === 'login' ? ' active' : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            {t.authLogin}
          </button>
          <button
            className={`auth-tab${tab === 'signup' ? ' active' : ''}`}
            onClick={() => { setTab('signup'); setError(''); }}
          >
            {t.authSignup}
          </button>
        </div>

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

        {/* Divider */}
        <div className="auth-divider">
          <span>{t.authOr}</span>
        </div>

        {/* Email/Password Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="email"
            placeholder={t.authEmail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className="auth-input"
            type="password"
            placeholder={t.authPassword}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit-btn" type="submit" disabled={submitting}>
            {tab === 'login' ? t.authLogin : t.authSignup}
          </button>
        </form>
      </div>
    </div>
  );
};
