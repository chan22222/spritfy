export function validateImage(file: File): { valid: boolean; error?: string } {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) return { valid: false, error: 'PNG, GIF, WebP만 지원합니다.' };
  if (file.size > maxSize) return { valid: false, error: '파일 크기는 5MB 이하여야 합니다.' };
  return { valid: true };
}

export async function generateThumbnail(file: File, maxWidth = 300): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      // For pixel art, use nearest-neighbor scaling
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Thumbnail generation failed')),
        'image/webp',
        0.8
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function validateAvatarImage(file: File): { valid: boolean; error?: string } {
  const maxSize = 2 * 1024 * 1024;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) return { valid: false, error: 'PNG, JPG, WebP only' };
  if (file.size > maxSize) return { valid: false, error: 'Max 2MB' };
  return { valid: true };
}

export async function generateAvatarThumbnail(file: File, size = 128): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          blob ? resolve(blob) : reject(new Error('Avatar thumbnail failed'));
        },
        'image/webp',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}
