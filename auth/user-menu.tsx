import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context.tsx';
import { useLangPath } from '@/lang-context.ts';
import '@/auth/user-menu.css';

export const UserMenu: React.FC = () => {
  const { user, signOut } = useAuth();
  const lp = useLangPath();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const displayName =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'User';

  const avatarUrl = user.user_metadata?.avatar_url || null;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // sign out error silently handled
    }
    setOpen(false);
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="User menu"
      >
        {avatarUrl ? (
          <img className="user-avatar" src={avatarUrl} alt="" />
        ) : (
          <span className="user-avatar-fallback">
            <span className="material-symbols-outlined" aria-hidden="true">person</span>
          </span>
        )}
        <span className="user-menu-name">{displayName}</span>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="user-menu-dropdown" role="menu">
          <Link
            to={lp('/gallery?mine=true')}
            className="user-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">collections</span>
            My Posts
          </Link>
          <button
            className="user-menu-item"
            role="menuitem"
            onClick={handleSignOut}
          >
            <span className="material-symbols-outlined" aria-hidden="true">logout</span>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
};
