'use strict';

const crypto = require('crypto');
const {
  isConfigured, passwordMatches, createSessionCookie, clearSessionCookie, isAuthed
} = require('./lib/auth');
const { json, response } = require('./lib/http');
const { initCloud } = require('./lib/cloud');

const CONTENT_COLLECTION = 'hovai';
const CONTENT_DOC_ID = 'content';
const SESSIONS_COLLECTION = 'hovai_uploads';
const MAX_SIZE = 300 * 1024 * 1024;
const DEFAULT_CHUNK = 3 * 1024 * 1024;
const UPLOAD_DIR = 'hovai/uploads';

function db() {
  return initCloud().database();
}
function storage() {
  return initCloud().storage;
}

// ---------------------------------------------------------------------------
// request helpers
function lowerHeaders(h) {
  const out = {};
  for (const k of Object.keys(h || {})) out[String(k).toLowerCase()] = h[k];
  return out;
}

function parseBody(event) {
  if (event && typeof event.body === 'string') {
    return Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
  }
  if (event && event.body && typeof event.body === 'object') {
    return Buffer.from(JSON.stringify(event.body), 'utf8');
  }
  return Buffer.alloc(0);
}

function parseJsonBody(event) {
  const source = parseBody(event).toString('utf8');
  if (!source) return {};
  try { return JSON.parse(source); } catch (_) { return {}; }
}

function isSecure(event, headers) {
  const proto = String(headers['x-forwarded-proto'] || '').toLowerCase();
  return proto ? proto === 'https' : true;
}

// ---------------------------------------------------------------------------
// content
async function readContent() {
  try {
    const res = await db().collection(CONTENT_COLLECTION).doc(CONTENT_DOC_ID).get();
    return Array.isArray(res.data) ? res.data[0] : res.data;
  } catch (_) {
    return null;
  }
}

async function handleContent(event, method, headers) {
  if (method === 'GET') {
    const stored = await readContent();
    if (stored) return json(event, stored, 200, { 'x-hovai-storage': 'db' });
    return json(event, { version: 0 }, 200, { 'x-hovai-storage': 'empty' });
  }
  if (method === 'PUT') {
    if (!isAuthed(headers.cookie)) return json(event, { ok: false, error: 'Unauthorized' }, 401);
    const body = parseJsonBody(event);
    if (!body || !Array.isArray(body.categories) || !Array.isArray(body.projects)) {
      return json(event, { ok: false, error: 'Invalid content structure' }, 400);
    }
    const version = (Number(body.version) || 0) + 1;
    const doc = { ...body, version, updatedAt: new Date().toISOString() };
    try {
      await db().collection(CONTENT_COLLECTION).doc(CONTENT_DOC_ID).set({ data: doc });
    } catch (err) {
      console.error('content save failed', err);
      return json(event, { ok: false, error: err.message || 'Save failed' }, 500);
    }
    return json(event, { ok: true, version });
  }
  return json(event, { ok: false, error: 'Method not allowed' }, 405);
}

// ---------------------------------------------------------------------------
// media upload (chunked)
async function readUpload(id) {
  try {
    const res = await db().collection(SESSIONS_COLLECTION).doc(id).get();
    return Array.isArray(res.data) ? res.data[0] : res.data;
  } catch (_) {
    return null;
  }
}

function fileIDFor(filePath) {
  const env = process.env.CLOUD_ENV || '';
  const appid = process.env.CLIENT_APPID || 'hovai';
  return `cloud://${env}.${appid}/${filePath}`;
}

async function handleUploadInit(event, headers) {
  if (!isAuthed(headers.cookie)) return json(event, { ok: false, error: 'Unauthorized' }, 401);
  const body = parseJsonBody(event);
  const size = Number(body.size) || 0;
  if (size <= 0 || size > MAX_SIZE) {
    return json(event, { ok: false, error: 'File must be between 1 byte and 300 MB' }, 400);
  }
  const id = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(size / DEFAULT_CHUNK));
  await db().collection(SESSIONS_COLLECTION).doc(id).set({
    data: {
      status: 'pending',
      name: String(body.name || 'upload'),
      type: String(body.type || 'application/octet-stream'),
      size,
      totalChunks,
      createdAt: new Date().toISOString()
    }
  });
  return json(event, { ok: true, id, url: `/media/${id}`, chunkSize: DEFAULT_CHUNK, totalChunks });
}

async function handleUploadChunk(event, headers, id, index) {
  if (!isAuthed(headers.cookie)) return json(event, { ok: false, error: 'Unauthorized' }, 401);
  const i = Number(index);
  if (!id || !Number.isInteger(i) || i < 0) {
    return json(event, { ok: false, error: 'Invalid upload path' }, 400);
  }
  const session = await readUpload(id);
  if (!session) return json(event, { ok: false, error: 'Upload not found' }, 404);
  const chunk = parseBody(event);
  if (chunk.byteLength <= 0 || chunk.byteLength > DEFAULT_CHUNK + 1024) {
    return json(event, { ok: false, error: 'Invalid chunk size' }, 400);
  }
  const filePath = `${UPLOAD_DIR}/${id}/${String(i).padStart(6, '0')}`;
  try {
    await storage().uploadFile({ cloudPath: filePath, fileContent: chunk });
    await db().collection(SESSIONS_COLLECTION).doc(id).update({ data: { [`chunks.${i}`]: filePath } });
  } catch (err) {
    console.error('chunk upload failed', err);
    return json(event, { ok: false, error: 'Chunk upload failed' }, 500);
  }
  return json(event, { ok: true, index: i, bytes: chunk.byteLength });
}

async function handleUploadComplete(event, headers, id) {
  if (!isAuthed(headers.cookie)) return json(event, { ok: false, error: 'Unauthorized' }, 401);
  const session = await readUpload(id);
  if (!session) return json(event, { ok: false, error: 'Upload not found' }, 404);
  const totalChunks = Number(session.totalChunks) || 1;
  const chunks = session.chunks || {};
  const missing = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!chunks[i]) missing.push(i);
    if (missing.length > 8) break;
  }
  if (missing.length) return json(event, { ok: false, error: 'Upload is incomplete', missing }, 409);
  await db().collection(SESSIONS_COLLECTION).doc(id).update({
    data: { complete: true, completedAt: new Date().toISOString() }
  });
  return json(event, { ok: true, id, url: `/media/${id}` });
}

async function handleMedia(event, id) {
  const session = await readUpload(id);
  if (!session || !session.complete) return json(event, { ok: false, error: 'Not found' }, 404);
  const chunks = session.chunks || {};
  const indexes = Object.keys(chunks).map(Number).sort((a, b) => a - b);
  if (!indexes.length) return json(event, { ok: false, error: 'Not found' }, 404);
  const parts = [];
  for (const i of indexes) {
    try {
      const res = await storage().downloadFile({ fileID: fileIDFor(chunks[i]) });
      parts.push(res.fileContent);
    } catch (err) {
      console.error('media chunk missing', i, err);
      return json(event, { ok: false, error: 'Media error' }, 500);
    }
  }
  const buffer = Buffer.concat(parts);
  return response(event, 200, buffer, {
    'content-type': session.type || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(session.name || 'media')}`
  });
}

// ---------------------------------------------------------------------------
exports.main = async (event) => {
  event = event || {};
  const headers = lowerHeaders(event.headers);
  const method = (event.httpMethod || 'GET').toUpperCase();
  const pathname = String(event.path || event.rawPath || '/');

  try {
    if (pathname === '/api/health') {
      return json(event, {
        ok: true,
        service: 'hovai',
        adminPassword: Boolean(process.env.ADMIN_PASSWORD),
        sessionSecret: Boolean(process.env.SESSION_SECRET)
      });
    }
    if (pathname === '/api/auth/status') {
      return json(event, { ok: true, configured: isConfigured(), authenticated: isAuthed(headers.cookie) });
    }
    if (pathname === '/api/auth/login') {
      if (!isConfigured()) {
        return json(event, {
          ok: false,
          error: 'Admin is not configured. Add ADMIN_PASSWORD and SESSION_SECRET in the CloudBase console environment variables.'
        }, 503);
      }
      if (!passwordMatches(parseJsonBody(event).password)) {
        return json(event, { ok: false, error: 'Incorrect password' }, 401);
      }
      return json(event, { ok: true }, 200, { 'set-cookie': createSessionCookie(isSecure(event, headers)) });
    }
    if (pathname === '/api/auth/logout') {
      return json(event, { ok: true }, 200, { 'set-cookie': clearSessionCookie(isSecure(event, headers)) });
    }
    if (pathname === '/api/content') return handleContent(event, method, headers);

    if (pathname === '/api/upload/init') return handleUploadInit(event, headers);
    if (pathname.startsWith('/api/upload/chunk/')) {
      const rest = pathname.slice('/api/upload/chunk/'.length).split('/');
      return handleUploadChunk(event, headers, rest[0], rest[1]);
    }
    if (pathname.startsWith('/api/upload/complete/')) {
      return handleUploadComplete(event, headers, pathname.slice('/api/upload/complete/'.length));
    }
    if (pathname.startsWith('/media/')) return handleMedia(event, pathname.slice('/media/'.length));

    return json(event, { ok: false, error: 'Not found' }, 404);
  } catch (err) {
    console.error('hovai api error', err);
    return json(event, { ok: false, error: err && err.message ? err.message : 'Server error' }, 500);
  }
};