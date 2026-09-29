'use strict';
// HOVAI portfolio API - CloudBase port of the original edge worker.
//
// Routes (mounted at /api/* and /media/* via the function's HTTP access):
//   POST /api/login        issue an admin bearer token
//   GET  /api/portfolio    read the portfolio document (with etag + canEdit)
//   PUT  /api/portfolio    persist the portfolio document (etag-guarded)
//   POST /api/upload       store an uploaded jpg/mp4/webm into cloud storage
//   GET  /api/_diag        runtime diagnostics
//   GET  /media/<uuid>.*   stream an uploaded file (supports Range)
//
// Static assets ("/", "/style.css", "/app.js", "/seed/*") are served by
// CloudBase static website hosting, not by this function.

const { store } = require('./lib/store');
const { issueToken, isOwner } = require('./lib/auth');
const { buildRequest, toResult } = require('./lib/http');
const { SEED_DATA, FASHION_IMPORT, VIDEO_DEFAULTS } = require('./data');

const PORTFOLIO_KEY = 'portfolio.json';

function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start, end;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix)) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start >= size || start > end) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });

const owner = (req, env) => isOwner(req, env);
function applyImports(raw){const d=structuredClone(raw);d.appliedImports=Array.isArray(d.appliedImports)?d.appliedImports:[];
 if(!d.appliedImports.includes(FASHION_IMPORT.id)){
  const ids=new Set(d.projects.map(p=>p.id));for(const p of FASHION_IMPORT.projects)if(!ids.has(p.id))d.projects.push(structuredClone(p));
  d.categoryCovers??={};if(!d.categoryCovers.fashion)d.categoryCovers.fashion=FASHION_IMPORT.cover;
  for(const p of d.projects){for(const i of p.images){const defaults=VIDEO_DEFAULTS[i.id];if(defaults)for(const [k,v] of Object.entries(defaults))if(i[k]===undefined)i[k]=v;}if(p.title==='新项目'&&p.category==='motion'&&p.images.some(i=>VIDEO_DEFAULTS[i.id])){p.title='动态习作';p.titleEn='Motion Studies';}}
  d.appliedImports.push(FASHION_IMPORT.id);
 }return d;
}
function validate(d){
 const str=(s,n)=>typeof s==='string'&&s.length<=n;
 if(!d||!str(d.name,80)||!d.name.trim()||!str(d.bio,3000)||(d.city!==undefined&&!str(d.city,100))||!str(d.email,200)||!str(d.wechat,200)||!Array.isArray(d.projects)||d.projects.length>100)throw Error('请检查个人信息，项目最多 100 个');
 if(d.nameEn!==undefined&&!str(d.nameEn,80))throw Error('英文姓名过长');const coverKeys=['still','portrait','fashion','archive','motion','life','about'],assetValid=o=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.entries(o).every(([k,v])=>coverKeys.includes(k)&&typeof v==='string'&&/^\/media\/[a-f0-9-]{36}\.jpg$/.test(v));if(d.categoryCovers!==undefined&&(!d.categoryCovers||Array.isArray(d.categoryCovers)||typeof d.categoryCovers!=='object'||Object.entries(d.categoryCovers).some(([k,v])=>!coverKeys.includes(k)||!str(v,80))))throw Error('分类封面信息不正确');if(d.categoryMobileCovers!==undefined&&(!d.categoryMobileCovers||Array.isArray(d.categoryMobileCovers)||typeof d.categoryMobileCovers!=='object'||Object.entries(d.categoryMobileCovers).some(([k,v])=>!coverKeys.includes(k)||!str(v,80))))throw Error('手机分类封面信息不正确');if(d.categoryCoverAssets!==undefined&&!assetValid(d.categoryCoverAssets))throw Error('封面裁切信息不正确');if(d.categoryCoverMobileAssets!==undefined&&!assetValid(d.categoryCoverMobileAssets))throw Error('手机封面裁切信息不正确');if(d.categoryThumbFocus!==undefined&&(!d.categoryThumbFocus||Array.isArray(d.categoryThumbFocus)||typeof d.categoryThumbFocus!=='object'||Object.entries(d.categoryThumbFocus).some(([k,modes])=>!coverKeys.includes(k)||!modes||typeof modes!=='object'||Array.isArray(modes)||Object.entries(modes).some(([mode,pos])=>!['desktop','mobile'].includes(mode)||!pos||!['x','y'].every(n=>Number.isFinite(pos[n])&&pos[n]>=0&&pos[n]<=100)))))throw Error('首页缩略图取景位置不正确');if(d.categoryThumbFocus!==undefined&&Object.values(d.categoryThumbFocus).some(modes=>Object.values(modes).some(pos=>pos.zoom!==undefined&&(!Number.isFinite(pos.zoom)||pos.zoom<100||pos.zoom>250))))throw Error('首页小框放大比例不正确');if(d.categoryThumbCropRects!==undefined&&(!d.categoryThumbCropRects||typeof d.categoryThumbCropRects!=='object'||Array.isArray(d.categoryThumbCropRects)||Object.entries(d.categoryThumbCropRects).some(([k,modes])=>!coverKeys.includes(k)||!modes||typeof modes!=='object'||Array.isArray(modes)||Object.entries(modes).some(([mode,c])=>!['desktop','mobile'].includes(mode)||!c||!['x','y','w','h'].every(n=>Number.isFinite(c[n]))||c.x<0||c.y<0||c.w<5||c.h<5||c.x+c.w>100.001||c.y+c.h>100.001||(c.ratio!==undefined&&(!Number.isFinite(c.ratio)||c.ratio<.05||c.ratio>20))))))throw Error('首页小图裁切范围不正确');if(d.categoryCoverCropRects!==undefined&&(!d.categoryCoverCropRects||typeof d.categoryCoverCropRects!=='object'||Array.isArray(d.categoryCoverCropRects)||Object.entries(d.categoryCoverCropRects).some(([k,modes])=>!coverKeys.includes(k)||!modes||typeof modes!=='object'||Array.isArray(modes)||Object.entries(modes).some(([mode,c])=>!['desktop','mobile'].includes(mode)||!c||!['x','y','w','h'].every(n=>Number.isFinite(c[n]))||c.x<0||c.y<0||c.w<5||c.h<5||c.x+c.w>100.001||c.y+c.h>100.001))))throw Error('封面取景框信息不正确');const ids=new Set();let count=0;
 for(const p of d.projects){if(p.title==='')p.title='新项目';if(!/^[a-zA-Z0-9-]{1,80}$/.test(p.id)||ids.has(p.id)||!str(p.title,100)||!p.title.trim()||!str(p.year,60)||!['work','personal','archive'].includes(p.section)||typeof p.featured!=='boolean'||!Array.isArray(p.images))throw Error('请填写项目名称并检查展示位置');if(p.category!==undefined&&!['still','portrait','fashion','archive','motion','life'].includes(p.category))throw Error('请选择有效分类');if(p.titleEn!==undefined&&!str(p.titleEn,100))throw Error('英文标题过长');if(p.layout!==undefined&&!['lead','pairs','sequence'].includes(p.layout))throw Error('请选择有效版式');if(p.composition!==undefined&&!['auto','story','spread','pairs','grid'].includes(p.composition))throw Error('请选择有效组图版式');if(p.homeFit!==undefined&&!['auto','cover','contain'].includes(p.homeFit))throw Error('封面填充方式不正确');if(p.emphasis!==undefined&&typeof p.emphasis!=='boolean')throw Error('项目宽度不正确');ids.add(p.id);const imgs=new Set();for(const i of p.images){count++;if(!/^[a-zA-Z0-9-]{1,80}$/.test(i.id)||imgs.has(i.id)||!/^\/(seed\/[0-9]{4}\.jpg|media\/[a-f0-9-]{36}\.(jpg|mp4|webm))$/.test(i.src)||!str(i.name,300)||!str(i.alt,300)||typeof i.wide!=='boolean')throw Error('图片信息不正确');if(i.title!==undefined&&!str(i.title,100))throw Error('视频标题过长');if(i.titleEn!==undefined&&!str(i.titleEn,100))throw Error('英文标题过长');if(i.poster!==undefined&&i.poster!==''&&!/^\/(seed\/[0-9]{4}\.jpg|media\/[a-f0-9-]{36}\.jpg)$/.test(i.poster))throw Error('视频封面不正确');if(i.frame!==undefined&&!['auto','custom','original','square','portrait','landscape','wide'].includes(i.frame))throw Error('画面比例不正确');if(i.fit!==undefined&&!['auto','cover','contain'].includes(i.fit))throw Error('图片填充方式不正确');if(i.crop!==undefined){const c=i.crop;if(!c||!['x','y','w','h'].every(k=>Number.isFinite(c[k]))||c.x<0||c.y<0||c.w<5||c.h<5||c.x+c.w>100.001||c.y+c.h>100.001)throw Error('自定义裁切范围不正确')}for(const k of ['focusX','focusY'])if(i[k]!==undefined&&(!Number.isFinite(i[k])||i[k]<0||i[k]>100))throw Error('裁切位置需在 0–100 之间');imgs.add(i.id)}if(p.images.length&&!imgs.has(p.cover))throw Error('请选择项目封面')}
 if(d.appliedImports!==undefined&&(!Array.isArray(d.appliedImports)||d.appliedImports.length>100||d.appliedImports.some(x=>!str(x,100))))throw Error('内容版本信息不正确');if(count>2000)throw Error('图片最多 2000 张');return d;
}

// ---------------------------------------------------------------------------
// Request handling. Mirrors the original worker's `fetch(req, env)` verbatim,
// with static-only branches removed (they are served by static hosting).
async function handle(req, env) {
  const url = new URL(req.url), path = url.pathname;
  if (path.startsWith('/api/')) {
    if (path === '/api/_diag' && req.method === 'GET') {
      let blobsError = 'ok';
      try { await store().getMetadata('__probe__'); } catch (e) { blobsError = String((e && e.message) || e); }
      return json({
        hasAdminPassword: Boolean(env && env.ADMIN_PASSWORD),
        blobsError,
        runtime: {
          hasNetlifyGlobal: typeof globalThis.Netlify !== 'undefined',
          hasProcess: typeof process !== 'undefined',
          hasDeno: typeof Deno !== 'undefined'
        }
      });
    }
    if (path === '/api/login' && req.method === 'POST') {
      if (!env.ADMIN_PASSWORD) return json({ error: '网站未配置管理密码，后台暂不可用' }, 503);
      const body = await req.text();
      if (body.length > 1000) return json({ error: '请求过大' }, 413);
      let password;
      try { password = JSON.parse(body).password; } catch { return json({ error: '请求格式不正确' }, 400); }
      if (typeof password !== 'string' || !password) return json({ error: '请输入管理密码' }, 400);
      const { passwordMatches } = require('./lib/auth');
      if (!passwordMatches(env, password)) return json({ error: '密码不正确' }, 401);
      return json({ token: issueToken(env), canEdit: true });
    }
    if (req.method !== 'GET' && !(await owner(req, env))) {
      return json({ error: '请使用网站所有者账号登录后编辑' }, 403);
    }
    if (path === '/api/portfolio' && req.method === 'GET') {
      const obj = await store().getWithMetadata(PORTFOLIO_KEY, { type: 'text' });
      const current = obj ? JSON.parse(obj.data) : null;
      return json({ data: applyImports(current || SEED_DATA), etag: (obj && obj.etag) || 'seed', canEdit: await owner(req, env) });
    }
    if (path === '/api/portfolio' && req.method === 'PUT') {
      const body = await req.text();
      if (body.length > 1000000) return json({ error: '内容过大' }, 413);
      let d;
      try { d = validate(JSON.parse(body)); } catch (e) { return json({ error: e.message }, 400); }
      const expected = req.headers.get('If-Match');
      if (!expected) return json({ error: '请重新加载网站后再保存' }, 428);
      const storeRef = store();
      const existing = await storeRef.getWithMetadata(PORTFOLIO_KEY, { type: 'text' });
      const currentEtag = (existing && existing.etag) || 'seed';
      if (currentEtag !== expected) return json({ error: '网站已在其他窗口更新。请保留当前修改，重新打开网站核对后保存。' }, 409);
      await storeRef.set(PORTFOLIO_KEY, JSON.stringify(d));
      const saved = await storeRef.getMetadata(PORTFOLIO_KEY);
      return json({ etag: (saved && saved.etag) || currentEtag });
    }
    if (path === '/api/upload' && req.method === 'POST') {
      const mime = req.headers.get('Content-Type') || '';
      const isVideo = ['video/mp4', 'video/webm'].includes(mime);
      const limit = isVideo ? 80 * 1024 * 1024 : 12582912;
      if (Number(req.headers.get('Content-Length')) > limit) return json({ error: '文件过大 / File too large' }, 413);
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > limit) return json({ error: '文件过大 / File too large' }, 413);
      const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const mp4 = bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
      const webm = bytes.length >= 4 && bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163;
      if (!(mime === 'video/mp4' ? mp4 : mime === 'video/webm' ? webm : jpeg)) return json({ error: '文件格式不正确 / Unsupported file' }, 400);
      const ext = mime === 'video/mp4' ? 'mp4' : mime === 'video/webm' ? 'webm' : 'jpg';
      const id = crypto.randomUUID();
      await store().set('images/' + id + '.' + ext, bytes, { metadata: { contentType: isVideo ? mime : 'image/jpeg' } });
      return json({ src: '/media/' + id + '.' + ext });
    }
    return json({ error: '找不到此操作' }, 404);
  }
  if (!['GET', 'HEAD'].includes(req.method)) return new Response('Method not allowed', { status: 405 });
  if (/^\/media\/[a-f0-9-]{36}\.(jpg|mp4|webm)$/.test(path)) {
    const key = 'images/' + path.split('/').pop();
    const stored = await store().getWithMetadata(key, { type: 'arrayBuffer' });
    if (!stored) return new Response('Not found', { status: 404 });
    const bytes = new Uint8Array(stored.data), size = bytes.length;
    const contentType = (stored.metadata && stored.metadata.contentType) || (path.endsWith('.mp4') ? 'video/mp4' : path.endsWith('.webm') ? 'video/webm' : 'image/jpeg');
    const headers = { 'Content-Type': contentType, 'Cache-Control': 'public,max-age=31536000,immutable', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
    const range = parseRange(req.headers.get('Range'), size);
    if (range === false) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': 'bytes */' + size } });
    let status = 200, body = bytes;
    if (range) { status = 206; body = bytes.subarray(range.start, range.end + 1); headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + size; }
    headers['Content-Length'] = String(body.length);
    return new Response(req.method === 'HEAD' ? null : body, { status, headers });
  }
  return new Response('Not found', { status: 404 });
}

// CloudBase entry point.
exports.main = async (event) => {
  let req;
  try {
    req = buildRequest(event);
  } catch (e) {
    return { statusCode: 400, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: '请求格式不正确' }) };
  }
  try {
    const res = await handle(req, process.env);
    return await toResult(res);
  } catch (e) {
    console.error('Portfolio request failed', e);
    let payload = { error: '暂时无法完成操作，请稍后重试。当前修改仍保留在页面中。', detail: String((e && e.message) || e) };
    try { payload = { ...payload }; } catch (_) {}
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify(payload)
    };
  }
};