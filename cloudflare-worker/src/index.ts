interface Env {
  R2_BUCKET: R2Bucket;
  SUPABASE_JWT_SECRET: string;
  ALLOWED_ORIGINS: string;
}

function corsHeaders(env: Env, origin: string): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
  const isAllowed = allowed.includes(origin) || allowed.includes('*');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

async function verifyJWT(token: string, secret: string): Promise<{ sub: string } | null> {
  try {
    // Decode JWT parts
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));

    // Verify it's HS256
    if (header.alg !== 'HS256') return null;

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    // Verify signature using Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureInput = encoder.encode(parts[0] + '.' + parts[1]);

    // Convert base64url to ArrayBuffer
    const signature = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify('HMAC', key, signature, signatureInput);
    if (!valid) return null;

    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(env, origin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);

    // POST /upload
    if (request.method === 'POST' && url.pathname === '/upload') {
      // Verify auth
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401, headers });
      }

      const payload = await verifyJWT(authHeader.slice(7), env.SUPABASE_JWT_SECRET);
      if (!payload) {
        return new Response('Invalid token', { status: 401, headers });
      }

      // Parse form data
      const formData = await request.formData();
      const original = formData.get('original') as File | null;
      const thumbnail = formData.get('thumbnail') as File | null;

      if (!original || !thumbnail) {
        return new Response('Missing files', { status: 400, headers });
      }

      // Validate
      if (original.size > 5 * 1024 * 1024) {
        return new Response('File too large (max 5MB)', { status: 413, headers });
      }

      const allowedTypes = ['image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(original.type)) {
        return new Response('Invalid file type', { status: 415, headers });
      }

      // Generate UUID path
      const uuid = crypto.randomUUID();
      const ext = original.name.split('.').pop()?.toLowerCase() || 'png';
      const originalKey = `gallery/${uuid}/original.${ext}`;
      const thumbnailKey = `gallery/${uuid}/thumb.webp`;

      // Upload to R2
      await env.R2_BUCKET.put(originalKey, original.stream(), {
        httpMetadata: { contentType: original.type },
      });
      await env.R2_BUCKET.put(thumbnailKey, thumbnail.stream(), {
        httpMetadata: { contentType: 'image/webp' },
      });

      // Return URLs (R2 public access via custom domain)
      // The public URL base should be configured; for now use the bucket's public URL pattern
      const publicBase = url.origin.replace('spritfy-r2-upload', 'r2-spritfy');

      return new Response(
        JSON.stringify({
          imageUrl: `/${originalKey}`,
          thumbnailUrl: `/${thumbnailKey}`,
        }),
        {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
        }
      );
    }

    // POST /upload-avatar
    if (request.method === 'POST' && url.pathname === '/upload-avatar') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401, headers });
      }

      const payload = await verifyJWT(authHeader.slice(7), env.SUPABASE_JWT_SECRET);
      if (!payload) {
        return new Response('Invalid token', { status: 401, headers });
      }

      const userId = payload.sub;

      const formData = await request.formData();
      const avatar = formData.get('avatar') as File | null;

      if (!avatar) {
        return new Response('Missing avatar file', { status: 400, headers });
      }

      if (avatar.size > 2 * 1024 * 1024) {
        return new Response('File too large (max 2MB)', { status: 413, headers });
      }

      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowedTypes.includes(avatar.type)) {
        return new Response('Invalid file type (PNG, JPG, WebP only)', { status: 415, headers });
      }

      const avatarKey = `avatars/${userId}/avatar.webp`;

      await env.R2_BUCKET.put(avatarKey, avatar.stream(), {
        httpMetadata: { contentType: 'image/webp' },
      });

      return new Response(
        JSON.stringify({ avatarUrl: `/${avatarKey}` }),
        {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
        }
      );
    }

    // DELETE /delete/:key
    if (request.method === 'DELETE' && url.pathname.startsWith('/delete/')) {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401, headers });
      }

      const payload = await verifyJWT(authHeader.slice(7), env.SUPABASE_JWT_SECRET);
      if (!payload) {
        return new Response('Invalid token', { status: 401, headers });
      }

      const key = decodeURIComponent(url.pathname.replace('/delete/', ''));
      await env.R2_BUCKET.delete(key);

      return new Response('Deleted', { status: 200, headers });
    }

    return new Response('Not Found', { status: 404, headers });
  },
};
