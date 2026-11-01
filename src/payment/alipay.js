'use strict';
const https = require('https');
const { config } = require('../config');
const { signRSA, verifyRSA } = require('../crypto');

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 组装待签名串：按 key 升序，key=value&...（不含 sign）
function buildSignContent(params) {
  const keys = Object.keys(params).filter((k) => k !== 'sign' && params[k] !== '' && params[k] != null);
  keys.sort();
  return keys.map((k) => `${k}=${params[k]}`).join('&');
}

// 创建支付宝下单，返回可直接 302 跳转的网关 URL
// type: 'page'(电脑网站) | 'wap'(手机网站)
function createOrder({ orderId, totalAmount, subject, type = 'page', returnUrl }) {
  const a = config.alipay;
  const method = type === 'wap' ? 'alipay.trade.wap.pay' : 'alipay.trade.page.pay';
  const params = {
    app_id: a.appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: now(),
    version: '1.0',
    notify_url: `${config.siteBaseUrl}/api/callback/alipay`,
    return_url: returnUrl || `${config.siteBaseUrl}/pay/result?provider=alipay`,
    biz_content: JSON.stringify({
      out_trade_no: orderId,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: Number(totalAmount).toFixed(2),
      subject: subject || '商品',
    }),
  };
  const sign = signRSA(a.privateKey, buildSignContent(params));
  params.sign = sign;
  const query = Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  return `${a.gateway}?${query}`;
}

// 以 form 形式 POST 到支付宝网关并解析 JSON 返回
function postForm(params) {
  return new Promise((resolve, reject) => {
    const query = Object.keys(params)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');
    const u = new URL(config.alipay.gateway);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(query);
    req.end();
  });
}

// 申请退款（支付宝 trade.refund 同步返回结果）
function createRefund({ orderId, refundAmount, reason, outRefundNo }) {
  const a = config.alipay;
  const params = {
    app_id: a.appId,
    method: 'alipay.trade.refund',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: now(),
    version: '1.0',
    biz_content: JSON.stringify({
      out_trade_no: orderId,
      refund_amount: Number(refundAmount).toFixed(2),
      refund_reason: reason || '协商退款',
      out_request_no: outRefundNo || `RF${orderId}`,
    }),
  };
  params.sign = signRSA(a.privateKey, buildSignContent(params));
  return postForm(params);
}

// 获取对账单下载地址（对账用）；返回 { bill_download_url }
function getBillUrl(billDate) {
  const a = config.alipay;
  const params = {
    app_id: a.appId,
    method: 'alipay.data.dataservice.bill.downloadurl.query',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: now(),
    version: '1.0',
    biz_content: JSON.stringify({ bill_type: 'trade', bill_date: billDate }),
  };
  params.sign = signRSA(a.privateKey, buildSignContent(params));
  return postForm(params);
}

// 校验支付宝异步通知签名
function verifyNotify(postParams) {
  const sig = postParams.sign;
  const content = buildSignContent(postParams);
  return verifyRSA(config.alipay.publicKey, content, sig);
}

module.exports = { createOrder, verifyNotify, createRefund, getBillUrl, postForm };
