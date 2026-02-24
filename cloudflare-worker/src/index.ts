interface Env {
  R2_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  ALLOWED_ORIGINS: string;
}

interface JWK {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

interface JWKS {
  keys: JWK[];
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

function base64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Cache JWKS keys in memory (Worker instance lifetime)
let cachedKeys: Map<string, CryptoKey> = new Map();
let jwksFetchedAt = 0;
const JWKS_CACHE_TTL = 3600_000; // 1 hour

async function getPublicKey(kid: string, supabaseUrl: string): Promise<CryptoKey | null> {
  // Return cached key if fresh
  if (cachedKeys.has(kid) && Date.now() - jwksFetchedAt < JWKS_CACHE_TTL) {
    return cachedKeys.get(kid)!;
  }

  // Fetch JWKS from Supabase
  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(jwksUrl);
  if (!res.ok) return null;

  const jwks: JWKS = await res.json();
  cachedKeys = new Map();
  jwksFetchedAt = Date.now();

  for (const jwk of jwks.keys) {
    if (jwk.kty === 'EC' && jwk.crv === 'P-256' && jwk.kid) {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      cachedKeys.set(jwk.kid, key);
    }
  }

  return cachedKeys.get(kid) || null;
}

async function verifyJWT(token: string, supabaseUrl: string): Promise<{ sub: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    if (header.alg === 'ES256' && header.kid) {
      // ECDSA P-256 verification with JWKS public key
      const publicKey = await getPublicKey(header.kid, supabaseUrl);
      if (!publicKey) return null;

      const encoder = new TextEncoder();
      const signatureInput = encoder.encode(parts[0] + '.' + parts[1]);
      const signature = base64urlDecode(parts[2]);

      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signature,
        signatureInput
      );

      return valid ? { sub: payload.sub } : null;
    }

    return null;
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
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401, headers });
      }

      const payload = await verifyJWT(authHeader.slice(7), env.SUPABASE_URL);
      if (!payload) {
        return new Response('Invalid token', { status: 401, headers });
      }

      const formData = await request.formData();
      const original = formData.get('original') as File | null;
      const thumbnail = formData.get('thumbnail') as File | null;

      if (!original || !thumbnail) {
        return new Response('Missing files', { status: 400, headers });
      }

      if (original.size > 5 * 1024 * 1024) {
        return new Response('File too large (max 5MB)', { status: 413, headers });
      }

      const allowedTypes = ['image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(original.type)) {
        return new Response('Invalid file type', { status: 415, headers });
      }

      const uuid = crypto.randomUUID();
      const ext = original.name.split('.').pop()?.toLowerCase() || 'png';
      const originalKey = `gallery/${uuid}/original.${ext}`;
      const thumbnailKey = `gallery/${uuid}/thumb.webp`;

      await env.R2_BUCKET.put(originalKey, original.stream(), {
        httpMetadata: { contentType: original.type },
      });
      await env.R2_BUCKET.put(thumbnailKey, thumbnail.stream(), {
        httpMetadata: { contentType: 'image/webp' },
      });

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

      const payload = await verifyJWT(authHeader.slice(7), env.SUPABASE_URL);
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

      const payload = await verifyJWT(authHeader.slice(7), env.SUPABASE_URL);
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
