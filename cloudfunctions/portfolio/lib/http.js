'use strict';
// Translates between CloudBase HTTP-function events and the fetch-style
// Request/Response objects the original worker logic was written against.

function buildRequest(event) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (v !== undefined && v !== null) headers.set(k, String(v));
  }
  const proto = (event.headers && (event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'])) || 'https';
  const host = (event.headers && (event.headers.host || event.headers.Host)) || 'localhost';
  const url = `${proto}://${host}${event.path || event.rawPath || '/'}${
    event.queryStringParameters && Object.keys(event.queryStringParameters).length
      ? '?' + new URLSearchParams(event.queryStringParameters).toString()
      : ''
  }`;
  const method = (event.httpMethod || event.requestContext?.httpMethod || 'GET').toUpperCase();
  let body;
  if (method !== 'GET' && method !== 'HEAD' && event.body !== undefined && event.body !== null) {
    body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
  }
  return new Request(url, { method, headers, body });
}

async function toResult(response) {
  const headers = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  const statusCode = response.status;
  const contentType = response.headers.get('content-type') || '';
  if (statusCode === 204 || statusCode === 304) {
    return { statusCode, headers };
  }
  const isBinary = /^(image|video|application\/octet-stream|font|audio)/i.test(contentType);
  if (isBinary) {
    const buf = Buffer.from(await response.arrayBuffer());
    return { statusCode, headers, isBase64Encoded: true, body: buf.toString('base64') };
  }
  const text = await response.text();
  return { statusCode, headers, body: text };
}

module.exports = { buildRequest, toResult };