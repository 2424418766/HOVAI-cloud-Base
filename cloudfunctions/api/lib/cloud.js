const CLOUD_ENV = process.env.CLOUD_ENV || '';

let app = null;

function initCloud() {
  if (app) return app;
  const cloud = require('wx-server-sdk');
  if (CLOUD_ENV) cloud.init({ env: CLOUD_ENV });
  else cloud.init();
  app = cloud;
  return app;
}

module.exports = { initCloud };