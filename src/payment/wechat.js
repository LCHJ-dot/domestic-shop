'use strict';
const https = require('https');
const { config } = require('../config');
const { signRSA, verifyRSA, decryptWechatResource, randomString } = require('../crypto');

const BASE = 'https://api.mch.weixin.qq.com';

function buildAuthHeader(method, urlPath, bodyStr) {
  const mch = config.wechat;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomString(32);
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyStr}\n`;
  const signature = signRSA(mch.privateKey, message);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mch.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${mch.serialNo}"`;
}

function httpsPostJson(urlPath, payload) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);
    const url = `${BASE}${urlPath}`;
    const u = new URL(url);
    const headers = {
      Authorization: buildAuthHeader('POST', urlPath, bodyStr),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'domestic-shop/0.1',
    };
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function httpsGetJson(urlPath) {
  return new Promise((resolve, reject) => {
    const url = `${BASE}${urlPath}`;
    const u = new URL(url);
    const headers = {
      Authorization: buildAuthHeader('GET', urlPath, ''),
      Accept: 'application/json',
      'User-Agent': 'domestic-shop/0.1',
    };
    https.get(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch (e) {
            reject(e);
          }
        });
      }
    ).on('error', reject);
  });
}

// 创建微信支付订单；type: 'native'(PC扫码) | 'h5'(手机浏览器唤起)
async function createOrder({ orderId, totalAmount, description, clientIp, type = 'native' }) {
  const mch = config.wechat;
  const urlPath = type === 'h5' ? '/v3/pay/transactions/h5' : '/v3/pay/transactions/native';
  const payload = {
    mchid: mch.mchId,
    appid: mch.appId,
    description: description || '商品',
    out_trade_no: orderId,
    notify_url: `${config.siteBaseUrl}/api/callback/wechat`,
    amount: { total: Math.round(totalAmount * 100), currency: 'CNY' },
  };
  if (type === 'h5') {
    payload.scene_info = {
      payer_client_ip: clientIp || '127.0.0.1',
      h5_info: { type: 'Wap' },
    };
  }
  const res = await httpsPostJson(urlPath, payload);
  if (res.status !== 200) {
    throw new Error(`微信下单失败: ${res.status} ${JSON.stringify(res.body)}`);
  }
  // native 返回 code_url；h5 返回 h5_url
  return res.body;
}

// 校验回调签名并解密报文
function verifyCallback(rawBodyStr, headers) {
  const sig = headers['wechatpay-signature'];
  const ts = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const message = `${ts}\n${nonce}\n${rawBodyStr}\n`;
  const ok = verifyRSA(config.wechat.platformPublicKey, message, sig);
  if (!ok) throw new Error('微信回调签名校验失败');
  const resource = JSON.parse(rawBodyStr).resource;
  return decryptWechatResource(config.wechat.apiV3Key, resource);
}

// 申请退款；返回 { outRefundNo, status }（微信退款为异步，结果以退款回调为准）
async function createRefund({ orderId, totalAmount, refundAmount, reason, outRefundNo }) {
  const mch = config.wechat;
  const urlPath = '/v3/refund/domestic/refunds';
  const payload = {
    out_trade_no: orderId,
    out_refund_no: outRefundNo || `RF${orderId}`,
    reason: reason || '协商退款',
    notify_url: `${config.siteBaseUrl}/api/callback/refund/wechat`,
    amount: {
      refund: Math.round(Number(refundAmount) * 100),
      total: Math.round(Number(totalAmount) * 100),
      currency: 'CNY',
    },
  };
  const res = await httpsPostJson(urlPath, payload);
  if (res.status !== 200) {
    throw new Error(`微信退款申请失败: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { outRefundNo: res.body.out_refund_no, status: res.body.status };
}

// 校验退款回调签名并解密报文，返回 { outTradeNo, outRefundNo, refundStatus }
function verifyRefundCallback(rawBodyStr, headers) {
  const sig = headers['wechatpay-signature'];
  const ts = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const ok = verifyRSA(config.wechat.platformPublicKey, `${ts}\n${nonce}\n${rawBodyStr}\n`, sig);
  if (!ok) throw new Error('微信退款回调签名校验失败');
  const data = decryptWechatResource(config.wechat.apiV3Key, JSON.parse(rawBodyStr).resource);
  return {
    outTradeNo: data.out_trade_no,
    outRefundNo: data.out_refund_no,
    refundStatus: data.refund_status, // SUCCESS / CLOSED / ABNORMAL
  };
}

// 获取对账单下载地址（对账用）；返回 { download_url }
async function getBillUrl(billDate) {
  const urlPath = `/v3/bill/tradebill?bill_date=${billDate}&bill_type=ALL`;
  const res = await httpsGetJson(urlPath);
  if (res.status !== 200) {
    throw new Error(`微信对账单地址获取失败: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body; // { download_url, hash_type, hash_value }
}

module.exports = { createOrder, verifyCallback, createRefund, verifyRefundCallback, getBillUrl };
