import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Lang } from '@/i18n.ts';
import { Footer } from '@/footer.tsx';
import '@/legal.css';
import './converter.css';

interface ConverterFile {
  id: number;
  name: string;
  originalFile: File;
  originalUrl: string;
  format: string;
  size: number;
  convertedBlob: Blob | null;
  convertedUrl: string | null;
  converting: boolean;
  done: boolean;
}

interface ConverterProps {
  lang: Lang;
  t: Record<string, string>;
}

const FORMAT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  gif: 'image/gif',
};

const ICO_SIZES = [16, 32, 48, 64, 128, 256];

let fileIdCounter = 0;

function detectFormat(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'PNG', jpg: 'JPG', jpeg: 'JPG', webp: 'WebP',
    bmp: 'BMP', gif: 'GIF', ico: 'ICO', svg: 'SVG', tiff: 'TIFF', tif: 'TIFF',
  };
  return map[ext] || ext.toUpperCase() || 'Unknown';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function encodeBmp(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const pixelDataSize = rowSize * h;
  const fileSize = 54 + pixelDataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4D);
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelDataSize, true);

  for (let y = 0; y < h; y++) {
    const rowOffset = 54 + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 4;
      const dstIdx = rowOffset + x * 3;
      view.setUint8(dstIdx, data[srcIdx + 2]);
      view.setUint8(dstIdx + 1, data[srcIdx + 1]);
      view.setUint8(dstIdx + 2, data[srcIdx]);
    }
  }
  return new Blob([buffer], { type: 'image/bmp' });
}

function encodeIco(canvas: HTMLCanvasElement, size: number): Blob {
  const scaled = document.createElement('canvas');
  scaled.width = size;
  scaled.height = size;
  const sctx = scaled.getContext('2d')!;
  sctx.drawImage(canvas, 0, 0, size, size);
  const imageData = sctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  const bmpInfoSize = 40;
  const pixelDataSize = size * size * 4;
  const maskRowSize = Math.ceil(size / 32) * 4;
  const maskSize = maskRowSize * size;
  const imageSize = bmpInfoSize + pixelDataSize + maskSize;

  const fileSize = 6 + 16 + imageSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);

  const dirOffset = 6;
  view.setUint8(dirOffset, size >= 256 ? 0 : size);
  view.setUint8(dirOffset + 1, size >= 256 ? 0 : size);
  view.setUint8(dirOffset + 2, 0);
  view.setUint8(dirOffset + 3, 0);
  view.setUint16(dirOffset + 4, 1, true);
  view.setUint16(dirOffset + 6, 32, true);
  view.setUint32(dirOffset + 8, imageSize, true);
  view.setUint32(dirOffset + 12, 22, true);

  const bmpOffset = 22;
  view.setUint32(bmpOffset, bmpInfoSize, true);
  view.setInt32(bmpOffset + 4, size, true);
  view.setInt32(bmpOffset + 8, size * 2, true);
  view.setUint16(bmpOffset + 12, 1, true);
  view.setUint16(bmpOffset + 14, 32, true);
  view.setUint32(bmpOffset + 20, pixelDataSize + maskSize, true);

  const pixelOffset = bmpOffset + bmpInfoSize;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcIdx = ((size - 1 - y) * size + x) * 4;
      const dstIdx = pixelOffset + (y * size + x) * 4;
      view.setUint8(dstIdx, data[srcIdx + 2]);
      view.setUint8(dstIdx + 1, data[srcIdx + 1]);
      view.setUint8(dstIdx + 2, data[srcIdx]);
      view.setUint8(dstIdx + 3, data[srcIdx + 3]);
    }
  }

  return new Blob([buffer], { type: 'image/x-icon' });
}

export const ConverterPage: React.FC<ConverterProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const [files, setFiles] = useState<ConverterFile[]>([]);
  const [outputFormat, setOutputFormat] = useState('png');
  const [quality, setQuality] = useState(92);
  const [icoSize, setIcoSize] = useState(64);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    return () => {
      files.forEach(f => {
        URL.revokeObjectURL(f.originalUrl);
        if (f.convertedUrl) URL.revokeObjectURL(f.convertedUrl);
      });
    };
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    const newFiles: ConverterFile[] = imageFiles.map(f => ({
      id: ++fileIdCounter,
      name: f.name,
      originalFile: f,
      originalUrl: URL.createObjectURL(f),
      format: detectFormat(f),
      size: f.size,
      convertedBlob: null,
      convertedUrl: null,
      converting: false,
      done: false,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((id: number) => {
    setFiles(prev => {
      const f = prev.find(x => x.id === id);
      if (f) {
        URL.revokeObjectURL(f.originalUrl);
        if (f.convertedUrl) URL.revokeObjectURL(f.convertedUrl);
      }
      return prev.filter(x => x.id !== id);
    });
  }, []);

  const removeAll = useCallback(() => {
    files.forEach(f => {
      URL.revokeObjectURL(f.originalUrl);
      if (f.convertedUrl) URL.revokeObjectURL(f.convertedUrl);
    });
    setFiles([]);
  }, [files]);

  const convertFile = useCallback(async (id: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, converting: true, done: false } : f));

    const file = files.find(f => f.id === id);
    if (!file) return;

    try {
      const img = await loadImage(file.originalUrl);
      const canvas = document.createElement('canvas');

      if (outputFormat === 'ico') {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      } else {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }

      const ctx = canvas.getContext('2d')!;

      if (outputFormat === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0);

      let blob: Blob | null = null;

      if (outputFormat === 'bmp') {
        blob = encodeBmp(canvas);
      } else if (outputFormat === 'ico') {
        blob = encodeIco(canvas, icoSize);
      } else if (outputFormat === 'gif') {
        const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
        const encoder = GIFEncoder();
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const palette = quantize(imageData.data, 256);
        const index = applyPalette(imageData.data, palette);
        encoder.writeFrame(index, canvas.width, canvas.height, { palette });
        encoder.finish();
        const bytes = encoder.bytes();
        blob = new Blob([bytes], { type: 'image/gif' });
      } else {
        const mime = FORMAT_MIME[outputFormat] || 'image/png';
        const q = (outputFormat === 'jpg' || outputFormat === 'webp') ? quality / 100 : undefined;
        blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, q));
      }

      if (blob) {
        setFiles(prev => prev.map(f => {
          if (f.id === id) {
            if (f.convertedUrl) URL.revokeObjectURL(f.convertedUrl);
            return {
              ...f,
              converting: false,
              done: true,
              convertedBlob: blob,
              convertedUrl: URL.createObjectURL(blob),
            };
          }
          return f;
        }));
      }
    } catch {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, converting: false } : f));
    }
  }, [files, outputFormat, quality, icoSize]);

  const convertAll = useCallback(async () => {
    for (const f of files) {
      if (!f.done && !f.converting) {
        await convertFile(f.id);
      }
    }
  }, [files, convertFile]);

  const downloadFile = useCallback((file: ConverterFile) => {
    if (!file.convertedUrl || !file.convertedBlob) return;
    const a = document.createElement('a');
    a.href = file.convertedUrl;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    a.download = `${baseName}.${outputFormat}`;
    a.click();
  }, [outputFormat]);

  const downloadAll = useCallback(() => {
    files.filter(f => f.done && f.convertedUrl).forEach(f => downloadFile(f));
  }, [files, downloadFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const showQuality = outputFormat === 'jpg' || outputFormat === 'webp';
  const showIcoSize = outputFormat === 'ico';
  const doneCount = files.filter(f => f.done).length;

  return (
    <div className="legal-page">
      <Helmet>
        <title>{t.seoConverterTitle}</title>
        <meta name="description" content={t.seoConverterDesc} />
        <link rel="canonical" href="https://spritfy.xyz/converter" />
        <meta property="og:title" content={t.seoConverterTitle} />
        <meta property="og:description" content={t.seoConverterDesc} />
        <meta property="og:url" content="https://spritfy.xyz/converter" />
      </Helmet>
      <div className="converter-content">
        <div className="converter-header">
          <div className="converter-icon-badge">
            <span className="material-symbols-outlined">swap_horiz</span>
          </div>
          <h1>{t.converterTitle}</h1>
          <p className="converter-subtitle">{t.converterSubtitle}</p>
        </div>

        {/* Drop Zone */}
        <div
          className={`converter-dropzone${isDragOver ? ' drag-over' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          aria-label={t.converterDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ''; } }}
          />
          <div className="dropzone-icon">
            <span className="material-symbols-outlined">add_photo_alternate</span>
          </div>
          <p className="dropzone-text">{t.converterDrop}</p>
          <p className="dropzone-hint">{t.converterSupported}</p>
        </div>

        {/* Controls */}
        {files.length > 0 && (
          <div className="converter-controls">
            <div className="converter-controls-row">
              <div className="control-group">
                <label>{t.converterFormat}</label>
                <select
                  value={outputFormat}
                  onChange={e => setOutputFormat(e.target.value)}
                  className="converter-select"
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="webp">WebP</option>
                  <option value="bmp">BMP</option>
                  <option value="ico">ICO</option>
                  <option value="gif">GIF</option>
                </select>
              </div>

              {showQuality && (
                <div className="control-group control-group-wide">
                  <label>{t.converterQuality}: {quality}%</label>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={quality}
                    onChange={e => setQuality(Number(e.target.value))}
                    className="converter-range"
                  />
                </div>
              )}

              {showIcoSize && (
                <div className="control-group">
                  <label>{t.converterIcoSize}</label>
                  <select
                    value={icoSize}
                    onChange={e => setIcoSize(Number(e.target.value))}
                    className="converter-select"
                  >
                    {ICO_SIZES.map(s => (
                      <option key={s} value={s}>{s}x{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="converter-actions">
              <button className="conv-btn conv-btn-primary" onClick={convertAll}>
                <span className="material-symbols-outlined">sync</span>
                {t.converterConvertAll}
              </button>
              {doneCount > 0 && (
                <button className="conv-btn conv-btn-secondary" onClick={downloadAll}>
                  <span className="material-symbols-outlined">download</span>
                  {t.converterDownloadAll}
                </button>
              )}
              <button className="conv-btn conv-btn-danger" onClick={removeAll}>
                <span className="material-symbols-outlined">delete_sweep</span>
                {t.converterRemoveAll}
              </button>
              <span className="file-counter">
                {files.length}{t.converterFileCount}
                {doneCount > 0 && ` / ${doneCount} ${t.converterDone.toLowerCase()}`}
              </span>
            </div>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="converter-file-list">
            {files.map(f => (
              <div key={f.id} className={`converter-file-card${f.done ? ' done' : ''}${f.converting ? ' converting' : ''}`}>
                <div className="file-card-preview">
                  <img src={f.originalUrl} alt={f.name} />
                </div>

                <div className="file-card-info">
                  <p className="file-card-name" title={f.name}>{f.name}</p>
                  <p className="file-card-meta">
                    <span className="file-format-badge">{f.format}</span>
                    <span>{formatSize(f.size)}</span>
                    {f.done && f.convertedBlob && (
                      <>
                        <span className="material-symbols-outlined file-arrow">arrow_forward</span>
                        <span className="file-format-badge badge-result">{outputFormat.toUpperCase()}</span>
                        <span>{formatSize(f.convertedBlob.size)}</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="file-card-actions">
                  {f.converting && (
                    <span className="converting-spinner">
                      <span className="material-symbols-outlined spin">progress_activity</span>
                    </span>
                  )}
                  {!f.converting && !f.done && (
                    <button
                      className="file-action-btn"
                      onClick={() => convertFile(f.id)}
                      title={t.converterConvert}
                    >
                      <span className="material-symbols-outlined">sync</span>
                    </button>
                  )}
                  {f.done && (
                    <button
                      className="file-action-btn action-download"
                      onClick={() => downloadFile(f)}
                      title={t.converterDownload}
                    >
                      <span className="material-symbols-outlined">download</span>
                    </button>
                  )}
                  <button
                    className="file-action-btn action-remove"
                    onClick={() => removeFile(f.id)}
                    title={t.converterRemove}
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                {f.converting && <div className="file-card-progress" />}
                {f.done && <div className="file-card-done-bar" />}
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {files.length === 0 && (
          <div className="converter-empty">
            <span className="material-symbols-outlined">image</span>
            <p>{t.converterNoFiles}</p>
          </div>
        )}
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};
