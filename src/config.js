'use strict';
const fs = require('fs');
const path = require('path');

// 简易 .env 加载器（零依赖）
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv();

function bool(v, def) {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  siteBaseUrl: (process.env.SITE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  paymentMode: (process.env.PAYMENT_MODE || 'mock').toLowerCase(),
  merchantCategory: process.env.MERCHANT_CATEGORY || 'general',

  wechat: {
    mchId: process.env.WECHAT_MCH_ID || '',
    appId: process.env.WECHAT_APP_ID || '',
    privateKey: loadKey(process.env.WECHAT_MCH_PRIVATE_KEY, process.env.WECHAT_MCH_PRIVATE_KEY_FILE),
    apiV3Key: process.env.WECHAT_API_V3_KEY || '',
    serialNo: process.env.WECHAT_SERIAL_NO || '',
    platformPublicKey: process.env.WECHAT_PLATFORM_PUBLIC_KEY || '',
  },
  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    privateKey: loadKey(process.env.ALIPAY_APP_PRIVATE_KEY, process.env.ALIPAY_APP_PRIVATE_KEY_FILE),
    publicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  },
};

function loadKey(direct, file) {
  if (direct) return direct;
  if (file && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  return '';
}

module.exports = { config, bool };
