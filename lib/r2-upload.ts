const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL as string;
const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL as string).replace(/\/$/, '');

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
    throw new Error(text || 'Upload failed');
  }

  const data: { imageUrl: string; thumbnailUrl: string } = await res.json();

  return {
    imageUrl: `${R2_PUBLIC_URL}${data.imageUrl}`,
    thumbnailUrl: `${R2_PUBLIC_URL}${data.thumbnailUrl}`,
  };
}
