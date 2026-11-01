'use strict';
// ===== Toast =====
function toast(msg, type) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) { alert(msg); return; }
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 1600);
  setTimeout(() => el.remove(), 2000);
}
// 兼容旧调用
function alert(msg) { toast(msg, 'ok'); }

// ===== 购物车（localStorage） =====
const CART_KEY = 'shop_cart';
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); }
function cartCount() { return getCart().reduce((s, i) => s + i.qty, 0); }
function updateBadge() {
  const el = document.getElementById('cartBadge');
  if (el) el.textContent = cartCount();
}
function addToCart(id, title, price) {
  const cart = getCart();
  const found = cart.find((i) => i.productId === id);
  if (found) found.qty += 1;
  else cart.push({ productId: id, title, price, qty: 1 });
  saveCart(cart);
  updateBadge();
  toast('已加入购物车', 'ok');
}
function fmt(n) { return '¥' + Number(n).toFixed(2); }

// ===== 商品详情页交互 =====
window.setMainImg = (el, g) => {
  document.getElementById('mainImg').textContent = g;
  el.parentElement.querySelectorAll('.t').forEach((t) => t.classList.remove('active'));
  el.classList.add('active');
};
window.stepQty = (delta) => {
  const inp = document.getElementById('buyQty');
  let v = Math.max(1, (parseInt(inp.value, 10) || 1) + delta);
  inp.value = v;
};
window.buyNow = (id, title, price) => {
  const qty = parseInt(document.getElementById('buyQty').value, 10) || 1;
  const cart = getCart().filter((i) => i.productId !== id);
  cart.push({ productId: id, title, price, qty });
  saveCart(cart); updateBadge();
  location.href = '/checkout';
};

// ===== 页面路由 =====
const page = document.body.getAttribute('data-page');

if (page === 'cart') {
  renderCart();
} else if (page === 'checkout') {
  renderCheckout();
} else if (page === 'pay') {
  const orderId = location.pathname.split('/').pop();
  renderPay(orderId);
} else if (page === 'mockpay') {
  const orderId = location.pathname.split('/').pop();
  document.getElementById('payBtn').onclick = async () => {
    const r = await fetch('/api/callback/mock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    if (r.ok) location.href = '/orders/' + orderId;
    else toast('模拟支付失败', 'err');
  };
} else if (page === 'orders') {
  const orderId = location.pathname.split('/').pop();
  window.requestRefund = async (orderId, total) => {
    const reason = prompt('退款原因（可选）：', '协商退款');
    if (reason === null) return;
    const r = await fetch('/api/refund/' + orderId, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: total, reason }),
    });
    const data = await r.json();
    if (r.ok) {
      toast(data.status === 'refunded' ? '退款成功' : '退款申请已提交，等待渠道处理', 'ok');
      setTimeout(() => location.reload(), 900);
    } else toast(data.error || '退款失败', 'err');
  };
} else if (page === 'reconcile') {
  document.getElementById('recBtn').onclick = async () => {
    const date = document.getElementById('recDate').value;
    const box = document.getElementById('recResult');
    box.innerHTML = '<p class="muted">对账中…</p>';
    const r = await fetch('/api/reconcile?date=' + encodeURIComponent(date));
    const data = await r.json();
    if (!r.ok) { box.innerHTML = '<p class="muted">对账失败：' + (data.error || '') + '</p>'; return; }
    const s = data.summary;
    const rows = (data.mismatches || []).map((m) =>
      `<div class="row"><div><span class="tag warn">${m.type}</span></div><div>${m.orderId}</div><div>${m.desc}</div></div>`).join('');
    box.innerHTML = `<div class="kv">
      <div>日期：${s.date}</div><div>本地已支付：${s.localPaidCount}</div>
      <div>账单成功：${s.billSuccessCount}</div><div>匹配：${s.matched}</div>
      <div>差异：${s.mismatched}</div><div class="${s.ok ? 'report-ok' : 'report-bad'}">${s.ok ? '✅ 一致' : '⚠️ 存在差异'}</div></div>
      <h3 style="margin-top:18px">差异明细</h3>${rows || '<p class="muted">无差异，账目一致 🎉</p>'}`;
  };
}
updateBadge();

// ===== 渲染：购物车 =====
function renderCart() {
  const cart = getCart();
  const box = document.getElementById('cartList');
  if (!cart.length) { box.innerHTML = '<p class="muted">购物车还是空的，去 <a href="/">首页</a> 逛逛吧～</p>'; return; }
  let total = 0;
  box.innerHTML = cart.map((i) => {
    total += i.price * i.qty;
    return `<div class="cart-item">
      <div class="ci-emoji">🛍️</div>
      <div><div class="ci-title">${i.title}</div><div class="ci-price">${fmt(i.price)}</div></div>
      <div class="qty">
        <button onclick="changeQty('${i.productId}',-1)">−</button>
        <input value="${i.qty}" readonly>
        <button onclick="changeQty('${i.productId}',1)">+</button>
      </div>
      <button class="btn ghost small" onclick="removeItem('${i.productId}')">删除</button>
    </div>`;
  }).join('') + `<div class="cart-summary">
      <span class="muted">共 ${cartCount()} 件</span>
      <span class="total">合计 ${fmt(total)}</span>
      <a class="btn accent" href="/checkout">去结算</a>
    </div>`;
}
window.changeQty = (id, delta) => {
  const cart = getCart();
  const it = cart.find((i) => i.productId === id);
  if (!it) return;
  it.qty = Math.max(1, it.qty + delta);
  saveCart(cart); updateBadge(); renderCart();
};
window.removeItem = (id) => {
  saveCart(getCart().filter((i) => i.productId !== id));
  updateBadge(); renderCart();
};

// ===== 渲染：结算 =====
function renderCheckout() {
  const cart = getCart();
  const box = document.getElementById('checkoutList');
  if (!cart.length) { location.href = '/cart'; return; }
  let total = 0;
  box.innerHTML = cart.map((i) => {
    total += i.price * i.qty;
    return `<div class="row"><div>${i.title}</div><div>${fmt(i.price)} × ${i.qty}</div></div>`;
  }).join('') + `<div class="row"><b>合计</b><b style="color:var(--price)">${fmt(total)}</b></div>`;

  document.getElementById('submitBtn').onclick = async () => {
    const contact = {
      name: document.getElementById('name').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value,
    };
    if (!contact.name || !contact.phone) { toast('请填写联系人', 'err'); return; }
    const r = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, contact }),
    });
    const data = await r.json();
    if (r.ok) {
      saveCart([]); updateBadge();
      location.href = '/pay/' + data.orderId;
    } else toast(data.error || '下单失败', 'err');
  };
}

// ===== 渲染：支付页 =====
async function renderPay(orderId) {
  const r = await fetch('/api/orders/' + orderId);
  if (!r.ok) { document.getElementById('payBox').innerHTML = '<p class="muted">订单不存在</p>'; return; }
  const order = await r.json();
  document.getElementById('orderInfo').innerHTML =
    `<div class="row"><div class="label">订单号</div><div>${order.id}</div></div>
     <div class="row"><div class="label">金额</div><div style="color:var(--price);font-weight:800;font-size:18px">${fmt(order.totalAmount)}</div></div>
     <div class="row"><div class="label">状态</div><div><span class="status-pill status-${order.status}">${order.status}</span></div></div>`;
  const methods = document.getElementById('methods');
  const channel = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'pc';
  order.providers.forEach((p) => {
    const map = { wechat: { ico: '💚', name: '微信支付', desc: '推荐 · 扫码/唤起' }, alipay: { ico: '🔵', name: '支付宝', desc: '扫码/跳转' }, mock: { ico: '🧪', name: '模拟支付(本地)', desc: '无商户号可测' } };
    const m = map[p] || { ico: '💰', name: p, desc: '' };
    const div = document.createElement('div');
    div.className = 'pay-method';
    div.innerHTML = `<span class="ico">${m.ico}</span><span><span class="name">${m.name}</span><br><span class="desc">${m.desc}</span></span>`;
    div.onclick = () => {
      document.querySelectorAll('.pay-method').forEach((x) => x.classList.remove('active'));
      div.classList.add('active');
      choosePay(orderId, p, channel);
    };
    methods.appendChild(div);
  });
}

async function choosePay(orderId, provider, channel) {
  const r = await fetch(`/api/pay/${orderId}?provider=${provider}&channel=${channel}`, { method: 'POST' });
  const data = await r.json();
  const box = document.getElementById('qrBox');
  if (data.url) { location.href = data.url; return; }
  if (data.payUrl) { location.href = data.payUrl; return; }
  if (data.qrContent) {
    box.innerHTML = `<p>请使用微信扫码支付：</p><div class="code">${data.qrContent}</div>`;
    if (window.QRCode) { const c = document.createElement('div'); new window.QRCode(c, data.qrContent); box.appendChild(c); }
  }
}
