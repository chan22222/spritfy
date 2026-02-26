import React, { useState, useRef, useEffect, useCallback } from 'react';
import '@/sounds/audio-player.css';

interface AudioPlayerProps {
  src: string;
  mini?: boolean;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const STOP_EVENT = 'spritfy:audio:stop';

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, mini = false }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const idRef = useRef(crypto.randomUUID());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail !== idRef.current) {
        audioRef.current?.pause();
        setPlaying(false);
      }
    };
    window.addEventListener(STOP_EVENT, handler);
    return () => window.removeEventListener(STOP_EVENT, handler);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      window.dispatchEvent(new CustomEvent(STOP_EVENT, { detail: idRef.current }));
      audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setCurrentTime(audio.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setDuration(audio.duration);
  }, []);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (mini) {
    return (
      <div className="ap-mini" onClick={e => e.preventDefault()}>
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
        <button className="ap-mini-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          <span className="material-symbols-outlined" aria-hidden="true">
            {playing ? 'pause' : 'play_arrow'}
          </span>
        </button>
        <div className="ap-mini-bar" ref={progressRef} onClick={handleProgressClick}>
          <div className="ap-mini-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="ap-mini-time">
          {duration > 0 ? formatTime(currentTime) : '--:--'}
        </span>
      </div>
    );
  }

  return (
    <div className="ap-full">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />
      <button className="ap-full-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 36 }}>
          {playing ? 'pause_circle' : 'play_circle'}
        </span>
      </button>
      <div className="ap-full-controls">
        <div className="ap-full-time-row">
          <span className="ap-full-time">{formatTime(currentTime)}</span>
          <div className="ap-full-bar" ref={progressRef} onClick={handleProgressClick}>
            <div className="ap-full-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="ap-full-time">{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
        <div className="ap-full-volume-row">
          <span className="material-symbols-outlined ap-full-vol-icon" aria-hidden="true" style={{ fontSize: 18 }}>
            {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
          </span>
          <input
            type="range"
            className="ap-full-volume"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
};
