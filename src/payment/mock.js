'use strict';
// 本地模拟支付：无需任何商户号即可跑通下单 -> 支付 -> 回调 -> 订单状态流转 全链路
function createOrder({ orderId }) {
  return { payUrl: `/mock-pay/${orderId}`, type: 'mock' };
}

// 模拟回调：本地点击"已支付"触发，等价于真实渠道的异步通知
function verifyCallback() {
  return { out_trade_no: null, trade_state: 'SUCCESS' };
}

// 模拟退款：本地直接返回成功（mock 模式退款为同步）
function createRefund({ orderId, outRefundNo }) {
  return { outRefundNo: outRefundNo || `RF${orderId}`, status: 'SUCCESS' };
}

module.exports = { createOrder, verifyCallback, createRefund };
