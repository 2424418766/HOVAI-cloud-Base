import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Provision an in-memory wx-server-sdk where the built function resolves it,
// so the whole suite runs offline without a CloudBase environment.
const FUNC_DIR = path.resolve('dist/cloudfunctions/portfolio');
const SDK_DIR = path.join(FUNC_DIR, 'node_modules/wx-server-sdk');
fs.mkdirSync(SDK_DIR, { recursive: true });
fs.writeFileSync(path.join(SDK_DIR, 'package.json'), '{ "name": "wx-server-sdk", "version": "0.0.0-test", "main": "index.js" }');
fs.cpSync(path.resolve('scripts/helpers/cloudbase-stub.cjs'), path.join(SDK_DIR, 'index.js'));

const sdk = require(path.join(SDK_DIR, 'index.js'));
const fn = require(path.join(FUNC_DIR, 'index.js'));

const ADMIN_PASSWORD = 'test-password';
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

function toEvent(pathname, options = {}) {
  const headers = {};
  for (const [k, v] of Object.entries(options.headers || {})) headers[k.toLowerCase()] = v;
  headers['host'] = headers['host'] || 'portfolio.test';
  let body;
  if (options.body !== undefined) {
    body = options.body instanceof Uint8Array ? Buffer.from(options.body).toString('base64') : String(options.body);
  }
  return {
    path: pathname,
    httpMethod: (options.method || 'GET').toUpperCase(),
    headers,
    queryStringParameters: options.query || {},
    body,
    isBase64Encoded: options.body instanceof Uint8Array
  };
}

async function call(pathname, options = {}) {
  const result = await fn.main(toEvent(pathname, options), {});
  const raw = result.isBase64Encoded ? Buffer.from(result.body, 'base64') : Buffer.from(result.body || '', 'utf8');
  return {
    status: result.statusCode,
    headers: new Headers(result.headers || {}),
    async json() { return JSON.parse(raw.toString('utf8')); },
    async arrayBuffer() { return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength); }
  };
}

const store = {
  async set(key, body) {
    sdk.__docs.set('portfolio/' + (process.env.CONTENT_DOC_ID || 'portfolio'), { body: String(body), etag: 'seed', metadata: {} });
  }
};
async function resetContent() { sdk.__docs.clear(); }

// ---------------------------------------------------------------------------
const login = await call('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const token = (await login.json()).token;
const auth = { Authorization: 'Bearer ' + token };

assert.equal((await call('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) })).status, 401);
assert.equal((await call('/api/login', { method: 'POST', body: 'not json' })).status, 400);
assert.equal((await call('/api/portfolio', { headers: { Authorization: 'Bearer 12345.forged' } })).status, 200);

let r = await call('/api/portfolio');
let initial = await r.json();
assert.equal(initial.canEdit, false);
assert.equal(initial.data.projects.length, 15);
assert.equal((await call('/api/portfolio', { method: 'PUT', body: '{}' })).status, 403);
r = await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': 'seed' }, body: JSON.stringify(initial.data) });
assert.equal(r.status, 200);
let rev = (await r.json()).etag;
assert.equal((await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': 'seed' }, body: JSON.stringify(initial.data) })).status, 409);
initial.data.name = '张活海';
r = await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': rev }, body: JSON.stringify(initial.data) });
assert.equal(r.status, 200);
r = await call('/api/portfolio', { headers: auth });
assert.equal((await r.json()).canEdit, true);
assert.equal((await call('/api/upload', { method: 'POST', headers: auth, body: 'invalid' })).status, 400);
r = await call('/api/upload', { method: 'POST', headers: { ...auth, 'Content-Type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255, 217]) });
assert.equal(r.status, 200);
const uploaded = await r.json();
r = await call(uploaded.src);
assert.equal(r.status, 200);
assert.deepEqual(new Uint8Array(await r.arrayBuffer()), new Uint8Array([255, 216, 255, 217]));
console.log('Passed: persistence, upload, authorization, concurrent-save conflict');

r = await call('/api/portfolio', { headers: auth });
let current = await r.json();
current.data.projects[0].category = 'fashion';
current.data.projects[0].titleEn = 'New editorial';
r = await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': current.etag }, body: JSON.stringify(current.data) });
assert.equal(r.status, 200);
r = await call('/api/portfolio');
assert.equal((await r.json()).data.projects[0].category, 'fashion');
const mp4 = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0]);
r = await call('/api/upload', { method: 'POST', headers: { ...auth, 'Content-Type': 'video/mp4' }, body: mp4 });
assert.equal(r.status, 200);
const movie = await r.json();
assert.ok(movie.src.endsWith('.mp4'));
r = await call(movie.src);
assert.equal(r.headers.get('Content-Type'), 'video/mp4');
assert.equal((await call('/api/upload', { method: 'POST', headers: { ...auth, 'Content-Type': 'video/mp4' }, body: 'not a video' })).status, 400);
console.log('Passed: category persistence and validated video upload/playback response');

r = await call('/api/portfolio', { headers: auth });
current = await r.json();
current.data.projects[0].layout = 'sequence';
current.data.categoryCovers = { still: current.data.projects[0].images[1].id, about: current.data.projects[0].images[0].id };
current.data.categoryMobileCovers = { still: current.data.projects[0].images[0].id };
current.data.categoryThumbFocus = { still: { desktop: { x: 62, y: 37, zoom: 165 }, mobile: { x: 40, y: 65, zoom: 120 } } };
current.data.categoryCoverAssets = { still: '/media/00000000-0000-0000-0000-000000000001.jpg' };
current.data.categoryCoverMobileAssets = { still: '/media/00000000-0000-0000-0000-000000000002.jpg' };
current.data.categoryCoverCropRects = { still: { desktop: { x: 0, y: 10, w: 100, h: 80 }, mobile: { x: 30, y: 0, w: 40, h: 100 } } };
current.data.categoryThumbCropRects = { still: { desktop: { x: 12, y: 8, w: 74, h: 55, ratio: 1.5 }, mobile: { x: 20, y: 10, w: 58, h: 62, ratio: 0.72 } } };
r = await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': current.etag }, body: JSON.stringify(current.data) });
assert.equal(r.status, 200);
r = await call('/api/portfolio');
const reread = await r.json();
assert.equal(reread.data.projects[0].layout, 'sequence');
assert.equal(reread.data.categoryCovers.still, current.data.categoryCovers.still);
assert.equal(reread.data.categoryCovers.about, current.data.categoryCovers.about);
assert.equal(reread.data.categoryThumbFocus.still.desktop.zoom, 165);
assert.equal(reread.data.categoryCoverCropRects.still.mobile.w, 40);
assert.equal(reread.data.categoryThumbCropRects.still.desktop.ratio, 1.5);
current.data.projects[0].layout = 'invalid';
assert.equal((await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': reread.etag }, body: JSON.stringify(current.data) })).status, 400);
console.log('Passed: persistent layout/independent covers and invalid-layout rejection');

await resetContent();
const catalog = JSON.parse(fs.readFileSync('src/video-defaults.json', 'utf8'));
const originals = Object.keys(catalog).map((id, n) => ({ id, src: `/media/${id}.mp4`, type: 'video', name: `clip${n}.mp4`, alt: '', wide: true }));
const base = JSON.parse(fs.readFileSync('src/seed.json', 'utf8'));
base.projects.unshift({ id: 'live-films', title: '新项目', titleEn: '', year: '', section: 'work', category: 'motion', featured: false, cover: originals[0].id, images: originals });
await store.set('portfolio.json', JSON.stringify(base));
r = await call('/api/portfolio');
const merged = await r.json();
assert.equal(merged.data.projects.filter((p) => p.category === 'fashion').length, 7);
assert.equal(merged.data.projects.filter((p) => p.category === 'fashion').flatMap((p) => p.images).length, 43);
const films = merged.data.projects[0].images;
assert.deepEqual(films.map((i) => i.src), originals.map((i) => i.src));
assert.ok(films.every((i) => i.poster && i.title));
merged.data.projects = merged.data.projects.filter((p) => p.id !== 'fashion-look-1');
r = await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': merged.etag }, body: JSON.stringify(merged.data) });
assert.equal(r.status, 200);
r = await call('/api/portfolio');
assert.equal((await r.json()).data.projects.filter((p) => p.category === 'fashion').length, 6);
console.log('Passed: 7-project / 43-photo import, all 11 video sources preserved, cover enrichment, edits/removals retained');

r = await call('/api/portfolio', { headers: auth });
current = await r.json();
const edited = current.data.projects[0];
edited.composition = 'spread';
edited.homeFit = 'contain';
edited.emphasis = true;
Object.assign(edited.images[0], { frame: 'custom', fit: 'cover', focusX: 23, focusY: 71, crop: { x: 10, y: 15, w: 65, h: 75 } });
const originalSrc = edited.images[0].src;
r = await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': current.etag }, body: JSON.stringify(current.data) });
assert.equal(r.status, 200);
r = await call('/api/portfolio');
current = await r.json();
assert.equal(current.data.projects[0].images[0].focusY, 71);
assert.equal(current.data.projects[0].images[0].src, originalSrc);
assert.equal(current.data.projects[0].composition, 'spread');
assert.equal(current.data.projects[0].images[0].crop.w, 65);
current.data.projects[0].images[0].focusX = 101;
assert.equal((await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': current.etag }, body: JSON.stringify(current.data) })).status, 400);
console.log('Passed: editable crop/layout persistence, original source retention, invalid focal position rejection');

r = await call('/api/portfolio', { headers: auth });
current = await r.json();
const fresh = { id: 'new-project-test', title: '', titleEn: '', category: 'still', layout: 'lead', composition: 'auto', year: '', section: 'work', featured: false, cover: 'new-project-image-1', images: Array.from({ length: 3 }, (_, n) => ({ id: `new-project-image-${n + 1}`, src: `/seed/${String(n + 1).padStart(4, '0')}.jpg`, name: `photo-${n + 1}.jpg`, alt: '', wide: false })) };
current.data.projects.unshift(fresh);
r = await call('/api/portfolio', { method: 'PUT', headers: { ...auth, 'If-Match': current.etag }, body: JSON.stringify(current.data) });
assert.equal(r.status, 200);
r = await call('/api/portfolio');
const created = await r.json();
assert.equal(created.data.projects[0].title, '新项目');
assert.equal(created.data.projects[0].images.length, 3);
console.log('Passed: a project with a blank hidden title saves, retains its images, and receives an internal default title');

console.log('All CloudBase portfolio tests passed.');