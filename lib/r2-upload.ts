const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL as string;
const R2_PUBLIC_URL = ((import.meta.env.VITE_R2_PUBLIC_URL as string) || '').replace(/\/$/, '');

export class UploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function uploadToR2(
  original: File,
  thumbnail: Blob,
  accessToken: string
): Promise<{ imageUrl: string; thumbnailUrl: string }> {
  const formData = new FormData();
  formData.append('original', original);
  formData.append('thumbnail', thumbnail, 'thumb.webp');

  const res = await fetch(`${R2_WORKER_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new UploadError(text || 'Upload failed', res.status);
  }

  const data: { imageUrl: string; thumbnailUrl: string } = await res.json();

  return {
    imageUrl: `${R2_PUBLIC_URL}${data.imageUrl}`,
    thumbnailUrl: `${R2_PUBLIC_URL}${data.thumbnailUrl}`,
  };
}

export async function uploadAudioToR2(
  file: File,
  accessToken: string
): Promise<{ audioUrl: string }> {
  const formData = new FormData();
  formData.append('audio', file);

  const res = await fetch(`${R2_WORKER_URL}/upload-audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new UploadError(text || 'Audio upload failed', res.status);
  }

  const data: { audioUrl: string } = await res.json();
  return { audioUrl: `${R2_PUBLIC_URL}${data.audioUrl}` };
}

export async function uploadAvatarToR2(
  avatarBlob: Blob,
  userId: string,
  accessToken: string
): Promise<string> {
  const formData = new FormData();
  formData.append('avatar', avatarBlob, 'avatar.webp');

  const res = await fetch(`${R2_WORKER_URL}/upload-avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new UploadError(text || 'Avatar upload failed', res.status);
  }

  const data: { avatarUrl: string } = await res.json();
  return `${R2_PUBLIC_URL}${data.avatarUrl}?v=${Date.now()}`;
}
