'use strict';
const { readJson, writeJson } = require('./store');
const { getById: getProductById } = require('./products');

// 订单状态机
// created(待支付) -> paid(已支付) -> shipped(已发货) -> completed(已完成)
// created -> closed(已关闭/超时)
// paid/shipped/completed -> refunding(退款中) -> refunded(已退款)
// refunding -> paid(退款失败回滚)
const STATUS = {
  CREATED: 'created',
  PAID: 'paid',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  REFUNDING: 'refunding',
  REFUNDED: 'refunded',
  CLOSED: 'closed',
};

const ALLOWED = {
  created: ['paid', 'closed'],
  paid: ['shipped', 'refunding'],
  shipped: ['completed', 'refunding'],
  completed: ['refunding'],
  refunding: ['refunded', 'paid'],
  refunded: [],
  closed: [],
};

function genOrderId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `ORDER${ts}${rand}`;
}

function getAll() {
  return readJson('orders', []);
}

function saveAll(list) {
  writeJson('orders', list);
}

function getById(orderId) {
  return getAll().find((o) => o.id === orderId) || null;
}

// 创建订单：items = [{productId, qty}]
function create(items, contact) {
  const list = getAll();
  const lines = [];
  let total = 0;
  for (const it of items) {
    const p = getProductById(it.productId);
    if (!p) throw new Error(`商品不存在: ${it.productId}`);
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    lines.push({ productId: p.id, title: p.title, price: p.price, qty });
    total += p.price * qty;
  }
  total = Math.round(total * 100) / 100;
  const order = {
    id: genOrderId(),
    items: lines,
    totalAmount: total, // 单位：元
    status: STATUS.CREATED,
    contact: contact || {},
    payment: null,
    refund: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
    updatedAt: new Date().toISOString(),
  };
  list.push(order);
  saveAll(list);
  return order;
}

// 状态流转（带校验）
function transition(orderId, to) {
  const list = getAll();
  const order = list.find((o) => o.id === orderId);
  if (!order) throw new Error('订单不存在');
  if (!ALLOWED[order.status].includes(to)) {
    throw new Error(`非法状态流转: ${order.status} -> ${to}`);
  }
  order.status = to;
  if (to === STATUS.PAID) order.paidAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  saveAll(list);
  return order;
}

function markPaid(orderId, provider, tradeNo) {
  const list = getAll();
  const order = list.find((o) => o.id === orderId);
  if (!order) throw new Error('订单不存在');
  if (!ALLOWED[order.status].includes(STATUS.PAID)) {
    throw new Error(`非法状态流转: ${order.status} -> paid`);
  }
  const now = new Date().toISOString();
  order.status = STATUS.PAID;
  order.payment = { provider, tradeNo, paidAt: now };
  order.paidAt = now;
  order.updatedAt = now;
  saveAll(list);
  return order;
}

function requestRefund(orderId, { amount, reason } = {}) {
  const list = getAll();
  const order = list.find((o) => o.id === orderId);
  if (!order) throw new Error('订单不存在');
  if (!ALLOWED[order.status].includes(STATUS.REFUNDING)) {
    throw new Error(`当前状态 ${order.status} 不可退款`);
  }
  const refundAmount = Math.min(Number(amount) || order.totalAmount, order.totalAmount);
  const now = new Date().toISOString();
  const outRefundNo = `RF${order.id}`;
  order.status = STATUS.REFUNDING;
  order.refund = {
    outRefundNo,
    amount: Math.round(refundAmount * 100) / 100,
    reason: reason || '',
    provider: order.payment ? order.payment.provider : null,
    requestedAt: now,
    refundedAt: null,
    providerRefundId: null,
  };
  order.updatedAt = now;
  saveAll(list);
  return order;
}

function markRefunded(orderId, providerRefundId) {
  const list = getAll();
  const order = list.find((o) => o.id === orderId);
  if (!order) throw new Error('订单不存在');
  if (order.status === STATUS.REFUNDED) return { ok: true, already: true };
  if (!ALLOWED[order.status].includes(STATUS.REFUNDED)) {
    throw new Error(`非法状态流转: ${order.status} -> refunded`);
  }
  const now = new Date().toISOString();
  order.status = STATUS.REFUNDED;
  order.refund = order.refund || {};
  order.refund.refundedAt = now;
  order.refund.providerRefundId = providerRefundId || null;
  order.updatedAt = now;
  saveAll(list);
  return { ok: true };
}

function markRefundFailed(orderId) {
  const list = getAll();
  const order = list.find((o) => o.id === orderId);
  if (!order) throw new Error('订单不存在');
  if (order.status !== STATUS.REFUNDING) throw new Error('状态异常，无法回滚');
  order.status = order.payment ? STATUS.PAID : STATUS.CREATED;
  order.updatedAt = new Date().toISOString();
  saveAll(list);
  return order;
}

module.exports = { STATUS, getAll, getById, create, transition, markPaid, requestRefund, markRefunded, markRefundFailed, genOrderId };
