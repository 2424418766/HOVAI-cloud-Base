'use strict';
// CloudBase replacement for `@netlify/blobs`' getStore().
//
// The original worker only needed a handful of operations on a single named
// store. We reproduce the same small surface on top of CloudBase:
//   - text/JSON blobs  -> a document in a cloud database collection
//   - binary blobs     -> a file in cloud storage
//
// `getWithMetadata`, `set`, `getMetadata` keep the same names/shapes the
// worker already uses, so the request logic stays unchanged.

const { cloud } = require('./cloud');

const CONTENT_COLLECTION = process.env.CONTENT_COLLECTION || 'portfolio';
const CONTENT_DOC_ID = process.env.CONTENT_DOC_ID || 'portfolio';

function db() {
  return cloud().database();
}

// Media files are addressed as `images/<id>.<ext>` just like before; object
// storage keys are derived by stripping the leading slash from `/media/...`.
function storagePath(key) {
  return `portfolio/${key}`;
}

function fileIdFor(key) {
  const env = process.env.CLOUD_ENV || '';
  const appid = process.env.CLIENT_APPID || 'portfolio';
  return `cloud://${env}.${appid}/${storagePath(key)}`;
}

// Deterministic etag for the content document: sha1 of the stored JSON body.
// CloudBase DB does not return an etag, so we derive one from content.
function etagOf(text) {
  const crypto = require('crypto');
  return 'rev' + crypto.createHash('sha1').update(text).digest('hex').slice(0, 20);
}

async function readContentDoc() {
  try {
    const res = await db().collection(CONTENT_COLLECTION).doc(CONTENT_DOC_ID).get();
    const doc = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!doc || typeof doc.body !== 'string') return null;
    return doc;
  } catch (_) {
    return null;
  }
}

// getWithMetadata(key, { type: 'text' | 'arrayBuffer' })
async function getWithMetadata(key, options = {}) {
  if (key === CONTENT_KEY) {
    const doc = await readContentDoc();
    if (!doc) return null;
    return { data: doc.body, etag: doc.etag || etagOf(doc.body), metadata: doc.metadata || {} };
  }
  // binary media
  try {
    const res = await cloud().storage.downloadFile({ fileID: fileIdFor(key) });
    const buf = res.fileContent;
    if (options.type === 'arrayBuffer') {
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const meta = await mediaMetadata(key);
      return { data: ab, etag: meta.etag, metadata: meta.metadata };
    }
    return { data: buf.toString('utf8'), etag: etagOf(buf.toString('utf8')), metadata: {} };
  } catch (_) {
    return null;
  }
}

// getMetadata(key)
async function getMetadata(key) {
  if (key === CONTENT_KEY) {
    const doc = await readContentDoc();
    return doc ? { etag: doc.etag || etagOf(doc.body), metadata: doc.metadata || {} } : null;
  }
  const meta = await mediaMetadata(key);
  return meta || null;
}

// set(key, body, { metadata })
async function set(key, body, options = {}) {
  if (key === CONTENT_KEY) {
    const text = typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
    const etag = etagOf(text);
    await db().collection(CONTENT_COLLECTION).doc(CONTENT_DOC_ID).set({
      data: { body: text, etag, metadata: options.metadata || {}, updatedAt: new Date().toISOString() }
    });
    return;
  }
  // binary media -> cloud storage
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
  const contentType = (options.metadata && options.metadata.contentType) || 'application/octet-stream';
  await cloud().storage.uploadFile({
    cloudPath: storagePath(key),
    fileContent: buf
  });
  await writeMediaMetadata(key, { contentType });
}

// ---------------------------------------------------------------------------
// media metadata is small and lives alongside the content document collection
// in a dedicated collection so `/media/*` can report a content type.
const MEDIA_COLLECTION = process.env.MEDIA_COLLECTION || 'portfolio_media';

async function mediaMetadata(key) {
  try {
    const res = await db().collection(MEDIA_COLLECTION).doc(encodeId(key)).get();
    const doc = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!doc) return null;
    return { etag: doc.etag, metadata: doc.metadata || {} };
  } catch (_) {
    return null;
  }
}

async function writeMediaMetadata(key, metadata) {
  const etag = etagOf(key + JSON.stringify(metadata));
  await db().collection(MEDIA_COLLECTION).doc(encodeId(key)).set({
    data: { key, etag, metadata, updatedAt: new Date().toISOString() }
  });
}

// CloudBase doc ids cannot contain `/`, so encode the storage key safely.
function encodeId(key) {
  return Buffer.from(key).toString('base64url');
}

const CONTENT_KEY = 'portfolio.json';

module.exports = { store: () => storeApi, CONTENT_KEY };

// A tiny object that mimics the single shared store instance the worker expects.
const storeApi = { getWithMetadata, getMetadata, set };