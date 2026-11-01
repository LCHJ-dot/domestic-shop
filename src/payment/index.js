'use strict';
const { config } = require('../config');
const wechat = require('./wechat');
const alipay = require('./alipay');
const mock = require('./mock');

// 根据 PAYMENT_MODE 返回启用的支付渠道
function enabledProviders() {
  const mode = config.paymentMode;
  if (mode === 'all') return ['wechat', 'alipay', 'mock'];
  if (mode === 'wechat') return ['wechat'];
  if (mode === 'alipay') return ['alipay'];
  return ['mock'];
}

// 发起支付，返回供前端渲染/跳转的描述
// channel: 'pc' | 'mobile'
async function initiate(provider, opts) {
  if (provider === 'mock') {
    const r = mock.createOrder(opts);
    return { provider: 'mock', method: 'mock', payUrl: r.payUrl };
  }
  if (provider === 'wechat') {
    const type = opts.channel === 'mobile' ? 'h5' : 'native';
    const r = await wechat.createOrder({ ...opts, type });
    if (type === 'h5') return { provider: 'wechat', method: 'redirect', url: r.h5_url };
    return { provider: 'wechat', method: 'qr', qrContent: r.code_url };
  }
  if (provider === 'alipay') {
    const type = opts.channel === 'mobile' ? 'wap' : 'page';
    const url = alipay.createOrder({ ...opts, type });
    return { provider: 'alipay', method: 'redirect', url };
  }
  throw new Error(`不支持的支付渠道: ${provider}`);
}

// 发起退款；返回 { provider, refundId, status, sync }
// sync=true 表示同步拿到结果（mock/alipay），可直接标记已退款；微信为异步，需等退款回调
async function refund(provider, opts) {
  if (provider === 'mock') {
    const r = mock.createRefund(opts);
    return { provider: 'mock', refundId: r.outRefundNo, status: 'SUCCESS', sync: true };
  }
  if (provider === 'wechat') {
    const r = await wechat.createRefund(opts);
    return { provider: 'wechat', refundId: r.outRefundNo, status: r.status, sync: false };
  }
  if (provider === 'alipay') {
    const r = alipay.createRefund(opts); // 同步返回
    const result = r['alipay_trade_refund_response'];
    const ok = result && result.code === '10000' && result.fund_change === 'Y';
    return { provider: 'alipay', refundId: result && result.trade_no, status: ok ? 'SUCCESS' : 'FAIL', sync: true };
  }
  throw new Error(`不支持的退款渠道: ${provider}`);
}

module.exports = { enabledProviders, initiate, refund, wechat, alipay, mock };
