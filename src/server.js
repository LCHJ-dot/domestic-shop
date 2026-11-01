'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { getAll: getProducts, getById: getProduct } = require('./products');
const { getAll: getOrders, getById: getOrder, create: createOrder, markPaid, requestRefund, markRefunded, markRefundFailed, STATUS } = require('./orders');
const payment = require('./payment');
const reconcile = require('./reconcile');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = config.port;

// ---------- 响应辅助 ----------
function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
function sendJson(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function parseForm(str) {
  const out = {};
  for (const pair of str.split('&')) {
    if (!pair) continue;
    const [k, v] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
  }
  return out;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 已支付处理（幂等） ----------
function handlePaid(orderId, provider, tradeNo) {
  const order = getOrder(orderId);
  if (!order) return { ok: false, error: '订单不存在' };
  if (order.status === STATUS.PAID || order.status === STATUS.SHIPPED || order.status === STATUS.COMPLETED) {
    return { ok: true, already: true };
  }
  markPaid(orderId, provider, tradeNo);
  return { ok: true };
}

// ---------- 页面模板 ----------
function layout(title, body, page) {
  return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/public/styles.css"></head>
<body data-page="${page}">
<header>
  <a href="/" class="logo">小众<span>优选</span></a>
  <form class="search-bar" action="/search" method="get">
    <input name="q" placeholder="搜索蓝海好物，如 宠物 / 收纳 / 清洁…">
    <button type="submit">搜索</button>
  </form>
  <div class="header-right">
    <a class="nav-link" href="/reconcile">对账</a>
    <a class="cart-link" href="/cart">🛒 购物车<span id="cartBadge" class="cart-badge">0</span></a>
  </div>
</header>
<div class="container">${body}</div>
<div class="toast-wrap" id="toastWrap"></div>
<footer>
  <div class="footer-grid">
    <div>
      <h4>小众优选 · 蓝海好物</h4>
      <p style="color:#9fb0ac;max-width:280px">聚焦细分人群的真实需求，一件代发、0 囤货，把小众做成大生意。</p>
    </div>
    <div><h4>购物指南</h4><a href="/">首页</a><a href="/search?q=">全部分类</a><a href="/reconcile">订单对账</a></div>
    <div><h4>服务保障</h4><a href="#">7 天无理由</a><a href="#">正品保障</a><a href="#">极速退款</a></div>
    <div><h4>关于我们</h4><a href="#">品牌故事</a><a href="#">合作招商</a><a href="#">联系客服</a></div>
  </div>
  <div class="footer-bottom">© 2026 小众优选 · 仅供学习演示 · 支付/退款/对账能力已就绪</div>
</footer>
<script src="/public/app.js"></script></body></html>`;
}

// 分类导航（从商品去重得到）
function categoryNav() {
  const cats = [];
  const seen = new Set();
  for (const p of getProducts()) {
    if (!seen.has(p.category)) { seen.add(p.category); cats.push(p); }
  }
  const iconFor = (c) => {
    const m = { '家居清洁': '🧹', '宠物用品': '🐾', '园艺耗材': '🌱', '中老年辅具': '🛡️', '小众工具': '✂️', '收纳': '📦' };
    return m[c] || '🛍️';
  };
  return cats.map((p) => `
    <a class="cat-item" href="/category?cat=${encodeURIComponent(p.category)}">
      <div class="emoji">${iconFor(p.category)}</div>
      <div class="name">${esc(p.category)}</div>
    </a>`).join('');
}

function productCard(p) {
  const tagClass = { '热销': 'hot', '新品': 'new', '匠心': 'craft', '蓝海': 'blue' }[p.tag] || '';
  return `<div class="card">
    <div class="thumb">${p.image}</div>
    <span class="tag ${tagClass}">${esc(p.tag || '')}</span>
    <div class="title">${esc(p.title)}</div>
    <div class="sub">${esc(p.subtitle || '')}</div>
    <div class="meta">
      <span class="price">¥${p.price} <small>起</small></span>
      <span class="sales">已售 ${p.sales || 0}</span>
    </div>
    <button class="btn block" style="margin-top:12px" onclick="addToCart('${p.id}','${esc(p.title)}',${p.price})">加入购物车</button>
  </div>`;
}

function homePage() {
  const all = getProducts();
  const news = all.filter((p) => p.tag === '新品');
  const hot = [...all].sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 4);
  return layout('小众优选 · 蓝海好物', `
  <div class="hero">
    <div class="hero-track">
      <div class="hero-slide s1"><h1>蓝海小众 · 真实需求</h1><p>聚焦细分人群，一件代发 0 囤货，把小众做成大生意。</p><a class="btn" href="/search?q=">立即选购</a></div>
      <div class="hero-slide s2"><h1>热销爆款 · 口碑复购</h1><p>宠物、收纳、园艺高频刚需，毛利高、售后轻。</p><a class="btn" href="/category?cat=${encodeURIComponent('宠物用品')}">看宠物好物</a></div>
      <div class="hero-slide s3"><h1>极速退款 · 安心下单</h1><p>微信 / 支付宝 全链路打通，退款对账一目了然。</p><a class="btn" href="/reconcile">了解对账</a></div>
    </div>
  </div>
  <div class="section-title">全部分类</div>
  <div class="cat-nav">${categoryNav()}</div>
  <div class="promo">
    <div>🚚 <b>一件代发</b> 0 囤货创业</div>
    <div>↩️ <b>7 天无理由</b> 售后无忧</div>
    <div>⚡ <b>极速退款</b> 资金更安全</div>
  </div>
  ${news.length ? `<div class="section-title">新品上线 <a class="more" href="/search?q=">查看全部 ›</a></div><div class="grid">${news.map(productCard).join('')}</div>` : ''}
  <div class="section-title">人气推荐 <a class="more" href="/search?q=">查看全部 ›</a></div>
  <div class="grid">${hot.map(productCard).join('')}</div>`, 'home');
}

function productPage(id) {
  const p = getProduct(id);
  if (!p) return layout('未找到', '<p>商品不存在</p>', 'home');
  const tagClass = { '热销': 'hot', '新品': 'new', '匠心': 'craft', '蓝海': 'blue' }[p.tag] || '';
  const gallery = (p.gallery && p.gallery.length ? p.gallery : [p.image]).map((g, i) =>
    `<div class="t ${i === 0 ? 'active' : ''}" onclick="setMainImg(this,'${g}')">${g}</div>`).join('');
  const body = `<div class="breadcrumb"><a href="/">首页</a> / <a href="/category?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a> / ${esc(p.title)}</div>
  <div class="panel"><div class="detail">
    <div class="gallery">
      <div class="main-img" id="mainImg">${p.image}</div>
      <div class="thumbs">${gallery}</div>
    </div>
    <div>
      <span class="tag ${tagClass}">${esc(p.tag || '')}</span>
      <h1 class="d-title">${esc(p.title)}</h1>
      <div class="d-sub">${esc(p.subtitle || '')}</div>
      <div class="price-box">
        <span class="price"><small>¥</small>${p.price}</span>
        <span class="sales">已售 ${p.sales || 0} · 库存 ${p.stock || 0}</span>
      </div>
      <div class="desc-box">${esc(p.desc)}</div>
      <div style="display:flex;align-items:center;gap:12px;margin:8px 0">
        <span class="muted" style="font-size:13px">数量</span>
        <div class="qty">
          <button onclick="stepQty(-1)">−</button>
          <input id="buyQty" value="1" readonly>
          <button onclick="stepQty(1)">+</button>
        </div>
      </div>
      <div class="action-row">
        <button class="btn ghost" onclick="buyNow('${p.id}','${esc(p.title)}',${p.price})">立即购买</button>
        <button class="btn accent" onclick="addToCart('${p.id}','${esc(p.title)}',${p.price})">加入购物车</button>
      </div>
      <div class="desc-box" style="margin-top:24px;background:var(--primary-soft);color:var(--primary-dark)">
        🛡️ 一件代发 · 7 天无理由 · 极速退款
      </div>
    </div>
  </div></div>`;
  return layout(p.title, body, 'product');
}

function cartPage() {
  return layout('购物车', `<div class="panel"><h2>购物车</h2><div id="cartList"></div>
    <a class="btn block" href="/checkout">去结算</a></div>`, 'cart');
}

function checkoutPage() {
  return layout('结算', `<div class="panel"><h2>填写收货信息</h2>
    <div id="checkoutList"></div>
    <label>姓名 *</label><input id="name" placeholder="收货人">
    <label>电话 *</label><input id="phone" placeholder="手机号">
    <label>地址</label><textarea id="address" rows="2" placeholder="收货地址"></textarea>
    <button id="submitBtn" class="btn block">提交订单</button></div>`, 'checkout');
}

function payPage(id) {
  const o = getOrder(id);
  if (!o) return layout('订单未找到', '<p>订单不存在</p>', 'pay');
  const body = `<div class="panel"><h2>订单支付</h2>
    <div id="orderInfo"></div><h3>选择支付方式</h3>
    <div id="methods"></div><div class="qr-box" id="qrBox"></div>
    <p class="muted">当前支付模式：${config.paymentMode}（mock 为本地模拟，无需商户号）</p></div>`;
  return layout('支付', body, 'pay');
}

function orderPage(id) {
  const o = getOrder(id);
  if (!o) return layout('订单未找到', '<p>订单不存在</p>', 'home');
  const items = o.items.map((i) => `<div class="row"><div>${esc(i.title)}</div><div>¥${i.price} × ${i.qty}</div></div>`).join('');
  const canRefund = ['paid', 'shipped', 'completed'].includes(o.status);
  const refundInfo = o.refund
    ? `<div class="row"><div>退款单号</div><div>${o.refund.outRefundNo}</div></div>
       <div class="row"><div>退款金额</div><div style="color:var(--price);font-weight:700">¥${o.refund.amount}</div></div>
       <div class="row"><div>退款状态</div><div><span class="status-pill status-${o.status}">${o.status}</span></div></div>`
    : '';
  const refundBtn = canRefund
    ? `<button class="btn warn" onclick="requestRefund('${o.id}',${o.totalAmount})">申请退款</button>`
    : '';
  const timeline = orderTimeline(o.status);
  const body = `<div class="panel"><div class="breadcrumb"><a href="/">首页</a> / 订单详情</div>
    <h2>订单详情</h2>
    <ul class="timeline">${timeline}</ul>
    <div class="row"><div class="label">订单号</div><div>${o.id}</div></div>
    ${items}
    <div class="row"><div class="label">合计</div><div style="color:var(--price);font-weight:800;font-size:18px">¥${o.totalAmount}</div></div>
    <div class="row"><div class="label">支付渠道</div><div>${o.payment ? o.payment.provider + ' / ' + o.payment.tradeNo : '未支付'}</div></div>
    ${refundInfo}
    <div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap">
      ${refundBtn}
      <a class="btn ghost" href="/admin">查看全部订单</a>
    </div>
  </div>`;
  return layout('订单详情', body, 'home');
}

// 订单状态时间线
function orderTimeline(status) {
  const steps = [
    { k: 'created', t: '提交订单', d: '等待支付' },
    { k: 'paid', t: '支付成功', d: '已收款，准备发货' },
    { k: 'shipped', t: '已发货', d: '商品已出库' },
    { k: 'completed', t: '已完成', d: '交易完成' },
  ];
  const idx = steps.findIndex((s) => s.k === status);
  const done = idx >= 0 ? idx : (status === 'refunding' ? 1 : status === 'refunded' ? 1 : -1);
  let html = steps.map((s, i) => `<li class="${i <= done ? 'done' : ''}"><div class="t">${s.t}</div><div class="d">${s.d}</div></li>`).join('');
  if (status === 'refunding' || status === 'refunded') {
    html += `<li class="done"><div class="t">退款${status === 'refunded' ? '成功' : '处理中'}</div><div class="d">${status === 'refunded' ? '已原路退回' : '等待渠道确认'}</div></li>`;
  }
  if (status === 'closed') html += `<li class="done"><div class="t">订单关闭</div><div class="d">超时未支付</div></li>`;
  return html;
}

function reconcilePage() {
  const today = new Date().toISOString().slice(0, 10);
  const body = `<div class="panel"><h2>对账中心</h2>
    <p class="muted">比对本地已支付订单与各支付渠道当日账单，找出漏单、账外收款与金额差异。</p>
    <label>对账日期</label><input id="recDate" value="${today}" placeholder="YYYY-MM-DD">
    <button id="recBtn" class="btn">执行对账</button>
    <div id="recResult" style="margin-top:16px"></div>
    <a class="btn ghost" href="/admin">返回订单管理</a></div>`;
  return layout('对账中心', body, 'reconcile');
}

function mockPayPage(orderId) {
  const body = `<div class="panel" style="text-align:center"><h2>🧪 模拟支付</h2>
    <p class="muted">这是本地模拟支付页（仅 mock 模式）。点击即模拟支付成功并触发回调。</p>
    <button id="payBtn" class="btn">我已支付</button></div>`;
  return layout('模拟支付', body, 'mockpay');
}

function adminPage() {
  const rows = getOrders().map((o) => `<tr>
    <td>${o.id}</td><td>¥${o.totalAmount}</td>
    <td><span class="status-pill status-${o.status}">${o.status}</span></td>
    <td>${o.payment ? o.payment.provider : '-'}</td>
    <td>${o.items.length} 件</td>
    <td><a class="btn ghost small" href="/orders/${o.id}">详情</a></td></tr>`).join('');
  return layout('订单管理', `<div class="panel"><div class="breadcrumb"><a href="/">首页</a> / 订单管理</div>
    <h2>全部订单</h2>
    <a class="btn ghost small" href="/reconcile">对账中心</a>
    <table class="table"><thead><tr><th>订单号</th><th>金额</th><th>状态</th><th>渠道</th><th>商品</th><th>操作</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">暂无订单</td></tr>'}</tbody></table></div>`, 'home');
}

function categoryPage(cat) {
  const list = cat ? getProducts().filter((p) => p.category === cat) : getProducts();
  const body = `<div class="breadcrumb"><a href="/">首页</a> / ${esc(cat || '全部分类')}</div>
    <div class="section-title">${esc(cat || '全部分类')} <span class="muted" style="font-size:14px;font-weight:400">共 ${list.length} 件</span></div>
    <div class="grid">${list.map(productCard).join('') || '<p class="muted">该分类暂无商品</p>'}</div>`;
  return layout(cat || '全部分类', body, 'home');
}

function searchPage(q) {
  const kw = (q || '').trim();
  const list = kw ? getProducts().filter((p) =>
    (p.title + p.subtitle + p.desc + p.category).toLowerCase().includes(kw.toLowerCase())) : getProducts();
  const body = `<div class="breadcrumb"><a href="/">首页</a> / 搜索</div>
    <div class="section-title">“${esc(kw)}” 的搜索结果 <span class="muted" style="font-size:14px;font-weight:400">共 ${list.length} 件</span></div>
    <div class="grid">${list.map(productCard).join('') || '<p class="muted">没有找到相关商品，换个关键词试试～</p>'}</div>`;
  return layout('搜索: ' + kw, body, 'home');
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    const pathname = u.pathname;
    const method = req.method;

    // 静态资源
    if (pathname.startsWith('/public/')) {
      const fp = path.join(PUBLIC_DIR, pathname.replace('/public/', ''));
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        const ext = path.extname(fp);
        const ct = { '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' }[ext] || 'text/plain';
        res.writeHead(200, { 'Content-Type': ct });
        fs.createReadStream(fp).pipe(res);
        return;
      }
      res.writeHead(404); res.end('not found'); return;
    }

    // ===== 页面 =====
    if (method === 'GET') {
      if (pathname === '/') return sendHtml(res, homePage());
      if (pathname === '/cart') return sendHtml(res, cartPage());
      if (pathname === '/checkout') return sendHtml(res, checkoutPage());
      if (pathname === '/admin') return sendHtml(res, adminPage());
      if (pathname === '/reconcile') return sendHtml(res, reconcilePage());
      if (pathname === '/category') return sendHtml(res, categoryPage(u.searchParams.get('cat')));
      if (pathname === '/search') return sendHtml(res, searchPage(u.searchParams.get('q')));
      if (pathname.startsWith('/products/')) return sendHtml(res, productPage(pathname.split('/')[2]));
      if (pathname.startsWith('/pay/') && pathname !== '/pay/result') return sendHtml(res, payPage(pathname.split('/')[2]));
      if (pathname.startsWith('/orders/')) return sendHtml(res, orderPage(pathname.split('/')[2]));
      if (pathname.startsWith('/mock-pay/')) return sendHtml(res, mockPayPage(pathname.split('/')[2]));
      if (pathname === '/pay/result') return sendHtml(res, layout('支付结果', '<div class="panel"><h2>支付完成</h2><p class="muted">如已支付，订单状态将在回调后更新。</p><a class="btn" href="/admin">查看订单</a></div>', 'home'));
    }

    // ===== API: 创建订单 =====
    if (method === 'POST' && pathname === '/api/orders') {
      const body = JSON.parse(await readBody(req));
      const order = createOrder(body.items || [], body.contact || {});
      return sendJson(res, { orderId: order.id, status: order.status });
    }

    // ===== API: 订单详情（含可用支付渠道） =====
    if (method === 'GET' && pathname.startsWith('/api/orders/')) {
      const o = getOrder(pathname.split('/')[3]);
      if (!o) return sendJson(res, { error: 'not found' }, 404);
      return sendJson(res, { ...o, providers: payment.enabledProviders() });
    }

    // ===== API: 发起支付 =====
    if (method === 'POST' && pathname.startsWith('/api/pay/')) {
      const orderId = pathname.split('/')[3];
      const provider = u.searchParams.get('provider');
      const channel = u.searchParams.get('channel') || 'pc';
      const order = getOrder(orderId);
      if (!order) return sendJson(res, { error: 'order not found' }, 404);
      if (order.status !== STATUS.CREATED) return sendJson(res, { error: 'order not payable', status: order.status }, 400);
      const result = await payment.initiate(provider, {
        orderId, totalAmount: order.totalAmount,
        description: order.items[0] ? order.items[0].title : '商品',
        clientIp: req.socket.remoteAddress, channel,
      });
      return sendJson(res, result);
    }

    // ===== API: 微信回调 =====
    if (method === 'POST' && pathname === '/api/callback/wechat') {
      const raw = await readBody(req);
      try {
        const data = payment.wechat.verifyCallback(raw, req.headers);
        const r = handlePaid(data.out_trade_no, 'wechat', data.transaction_id);
        return sendJson(res, { code: 'SUCCESS', ...r });
      } catch (e) {
        return sendJson(res, { code: 'FAIL', message: e.message }, 400);
      }
    }

    // ===== API: 支付宝回调 =====
    if (method === 'POST' && pathname === '/api/callback/alipay') {
      const params = parseForm(await readBody(req));
      try {
        if (!payment.alipay.verifyNotify(params)) return res.end('failure');
        if (['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status)) {
          handlePaid(params.out_trade_no, 'alipay', params.trade_no);
        }
        return res.end('success');
      } catch (e) {
        return res.end('failure');
      }
    }

    // ===== API: 模拟支付回调 =====
    if (method === 'POST' && pathname === '/api/callback/mock') {
      const body = JSON.parse(await readBody(req) || '{}');
      const r = handlePaid(body.orderId, 'mock', 'MOCK' + Date.now());
      return sendJson(res, r);
    }

    // ===== API: 申请退款 =====
    if (method === 'POST' && pathname.startsWith('/api/refund/')) {
      const orderId = pathname.split('/')[3];
      const body = JSON.parse(await readBody(req) || '{}');
      const order = getOrder(orderId);
      if (!order) return sendJson(res, { error: 'order not found' }, 404);
      if (!order.payment) return sendJson(res, { error: '该订单未支付，无法退款' }, 400);
      try {
        const updated = requestRefund(orderId, { amount: body.amount, reason: body.reason });
        const result = await payment.refund(order.payment.provider, {
          orderId,
          totalAmount: order.totalAmount,
          refundAmount: updated.refund.amount,
          reason: body.reason,
          outRefundNo: updated.refund.outRefundNo,
        });
        // 同步渠道（mock/alipay）直接标记已退款；微信异步，等退款回调
        if (result.sync && result.status === 'SUCCESS') {
          markRefunded(orderId, result.refundId);
        } else if (result.sync && result.status === 'FAIL') {
          markRefundFailed(orderId);
          return sendJson(res, { error: '退款失败', detail: result }, 400);
        }
        return sendJson(res, { ok: true, status: result.sync ? 'refunded' : 'refunding', provider: order.payment.provider });
      } catch (e) {
        return sendJson(res, { error: e.message }, 400);
      }
    }

    // ===== API: 微信退款回调 =====
    if (method === 'POST' && pathname === '/api/callback/refund/wechat') {
      const raw = await readBody(req);
      try {
        const data = payment.wechat.verifyRefundCallback(raw, req.headers);
        if (data.refundStatus === 'SUCCESS') markRefunded(data.outTradeNo, data.outRefundNo);
        return sendJson(res, { code: 'SUCCESS' });
      } catch (e) {
        return sendJson(res, { code: 'FAIL', message: e.message }, 400);
      }
    }

    // ===== API: 支付宝退款回调（若配置了异步通知） =====
    if (method === 'POST' && pathname === '/api/callback/refund/alipay') {
      const params = parseForm(await readBody(req));
      try {
        if (!payment.alipay.verifyNotify(params)) return res.end('failure');
        if (params.out_trade_no) markRefunded(params.out_trade_no, params.trade_no);
        return res.end('success');
      } catch (e) {
        return res.end('failure');
      }
    }

    // ===== API: 手动触发对账 =====
    if (method === 'GET' && pathname === '/api/reconcile') {
      const dateStr = u.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      let providers = payment.enabledProviders().filter((p) => p !== 'mock');
      if (!providers.length) providers = ['wechat', 'alipay'];
      try {
        const report = await reconcile.reconcile(providers, dateStr);
        return sendJson(res, report);
      } catch (e) {
        return sendJson(res, { error: e.message }, 500);
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.writeHead(500); res.end('Server Error'); }
  }
});

server.listen(PORT, () => {
  console.log(`\n🛒 小众优选 MVP 已启动: http://localhost:${PORT}`);
  console.log(`   支付模式: ${config.paymentMode}  |  管理后台: http://localhost:${PORT}/admin`);
  console.log(`   对账中心: http://localhost:${PORT}/reconcile\n`);
  // 每日 03:10 自动对账（仅当配置了真实支付渠道时生效）
  if (config.paymentMode !== 'mock') reconcile.startDailyScheduler();
});
