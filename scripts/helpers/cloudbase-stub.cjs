'use strict';
// In-memory stand-in for wx-server-sdk, so the CloudBase function runs offline.
const docs = new Map();   // collection/id -> data
const files = new Map();  // cloudPath -> Buffer

function docRef(collection, id) {
  const key = collection + '/' + id;
  return {
    async get() {
      if (!docs.has(key)) { const e = new Error('document does not exist'); e.errCode = -1; throw e; }
      return { data: { _id: id, ...docs.get(key) } };
    },
    async set({ data }) { docs.set(key, { ...data }); return {}; },
    async update({ data }) {
      const cur = { ...(docs.get(key) || {}) };
      for (const k of Object.keys(data)) {
        if (k.includes('.')) { const [a, b] = k.split('.'); cur[a] = { ...(cur[a] || {}), [b]: data[k] }; }
        else cur[k] = data[k];
      }
      docs.set(key, cur); return {};
    }
  };
}

const db = { collection: (name) => ({ doc: (id) => docRef(name, id) }) };

function normalize(content) {
  if (Buffer.isBuffer(content)) return Buffer.from(content);
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content === 'string') return Buffer.from(content, 'utf8');
  return Buffer.from(content);
}

const storage = {
  async uploadFile({ cloudPath, fileContent }) { files.set(cloudPath, normalize(fileContent)); return { fileID: 'cloud://' + cloudPath }; },
  async downloadFile({ fileID }) {
    const cloudPath = String(fileID).split('/').slice(3).join('/');
    const buf = files.get(cloudPath);
    if (!buf) { const e = new Error('file not found: ' + cloudPath); e.errCode = -1; throw e; }
    return { fileContent: buf };
  }
};

const sdk = {
  init() {},
  database: () => db,
  storage,
  __reset() { docs.clear(); files.clear(); },
  __docs: docs,
  __files: files
};

module.exports = sdk;
module.exports.default = sdk;