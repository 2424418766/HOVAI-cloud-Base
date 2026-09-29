'use strict';
// CloudBase SDK bootstrap. Kept tiny so the function stays reusable across envs.
const CLOUD_ENV = process.env.CLOUD_ENV || '';

let app = null;
function cloud() {
  if (app) return app;
  const sdk = require('wx-server-sdk');
  if (CLOUD_ENV) sdk.init({ env: CLOUD_ENV }); else sdk.init();
  app = sdk;
  return app;
}

module.exports = { cloud, CLOUD_ENV };