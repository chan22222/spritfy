import React from 'react';
import { Link } from 'react-router-dom';
import type { Lang } from '@/i18n.ts';
import type { Sound } from '@/sounds/types.ts';
import { AudioPlayer } from '@/sounds/audio-player.tsx';
import '@/sounds/sound-card.css';

interface SoundCardProps {
  sound: Sound;
  lang: Lang;
  t: Record<string, string>;
}

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (lang === 'ko') {
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 30) return `${days}일 전`;
    return new Date(dateStr).toLocaleDateString('ko-KR');
  }
  if (lang === 'ja') {
    if (mins < 1) return 'たった今';
    if (mins < 60) return `${mins}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 30) return `${days}日前`;
    return new Date(dateStr).toLocaleDateString('ja-JP');
  }
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US');
}

const CATEGORY_ICONS: Record<string, string> = {
  bgm: 'music_note',
  sfx: 'surround_sound',
  ui: 'touch_app',
  ambient: 'landscape',
  voice: 'record_voice_over',
};

export const SoundCard: React.FC<SoundCardProps> = ({ sound, lang, t }) => {
  const displayName = sound.profiles?.display_name || sound.profiles?.username || 'unknown';
  const catIcon = CATEGORY_ICONS[sound.category] || 'music_note';
  const catKey = `soundCat${sound.category.charAt(0).toUpperCase()}${sound.category.slice(1)}`;

  return (
    <div className="sound-card pixel-border">
      <Link to={`/${lang}/sounds/${sound.id}`} className="sound-card-link">
        <div className="sound-card-header">
          <span className={`sound-cat-badge cat-${sound.category}`}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 14 }}>{catIcon}</span>
            {t[catKey] || sound.category}
          </span>
          <span className="sound-card-format">{sound.format.toUpperCase()}</span>
        </div>
        <h3 className="sound-card-title">{sound.title}</h3>
        <p className="sound-card-meta">@{displayName} · {timeAgo(sound.created_at, lang)}</p>
      </Link>
      <AudioPlayer src={sound.audio_url} mini />
      <div className="sound-card-stats">
        <span className="sound-card-stat" aria-label={t.soundLikes || 'Likes'}>
          <span className="material-symbols-outlined" aria-hidden="true">favorite</span>
          {sound.likes_count}
        </span>
        <span className="sound-card-stat" aria-label={t.soundComments || 'Comments'}>
          <span className="material-symbols-outlined" aria-hidden="true">chat_bubble</span>
          {sound.comments_count}
        </span>
      </div>
    </div>
  );
};
