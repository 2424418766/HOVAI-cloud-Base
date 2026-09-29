function isHttp(event) {
  return Boolean(event && (event.headers || event.httpMethod || event.requestContext || event.path));
}

function response(event, statusCode, body, headers = {}) {
  const base64 = isHttp(event);
  const status = statusCode || 200;
  const out = { ...headers };
  if (typeof body === 'string') {
    out['content-type'] = out['content-type'] || 'text/plain; charset=utf-8';
    return { statusCode: status, headers: out, isBase64Encoded: base64, body };
  }
  out['content-type'] = out['content-type'] || 'application/octet-stream';
  return { statusCode: status, headers: out, isBase64Encoded: base64, body: body.toString('base64') };
}

function json(event, body, statusCode = 200, headers = {}) {
  return response(event, statusCode, JSON.stringify(body), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
}

module.exports = { response, json };