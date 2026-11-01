'use strict';
const https = require('https');
const zlib = require('zlib');
const { config } = require('./config');
const { getAll: getOrders, STATUS } = require('./orders');
const wechat = require('./payment/wechat');
const alipay = require('./payment/alipay');

// 取某天的本地"已支付及之后状态"的订单（dateStr: YYYY-MM-DD）
function localPaidOrders(dateStr) {
  return getOrders().filter((o) => {
    const paidDate = (o.paidAt || o.createdAt || '').slice(0, 10);
    return paidDate === dateStr && ['paid', 'shipped', 'completed', 'refunding', 'refunded'].includes(o.status);
  });
}

// ---------- 账单获取 ----------
// 返回统一格式: [{ outTradeNo, amount, status, provider }]，status 为 'SUCCESS' 表示成功收款

// 本地模拟账单：由当天已支付订单生成，并故意注入 1 条"仅账单有"的幽灵记录，用于演示差异检测
function mockBill(provider, dateStr) {
  const orders = localPaidOrders(dateStr);
  const entries = orders.map((o) => ({
    outTradeNo: o.id,
    amount: o.totalAmount,
    status: 'SUCCESS',
    provider,
  }));
  entries.push({ outTradeNo: 'ORDER_GHOST_0001', amount: 88.0, status: 'SUCCESS', provider, ghost: true });
  return entries;
}

// 真实微信账单：tradebill 返回 download_url(gzip) -> 下载解压 -> 解析 CSV
async function wechatBill(dateStr) {
  if (!config.wechat.mchId) return mockBill('wechat', dateStr);
  const billMeta = await wechat.getBillUrl(dateStr);
  const gz = await fetchBytes(billMeta.download_url);
  const csv = zlib.gunzipSync(gz).toString('utf8');
  return parseWechatCsv(csv);
}

// 真实支付宝账单：downloadurl.query 返回账单下载地址（zip/CSV）
async function alipayBill(dateStr) {
  if (!config.alipay.appId) return mockBill('alipay', dateStr);
  const r = await alipay.getBillUrl(dateStr);
  const resp = r['alipay_data_dataservice_bill_downloadurl_query_response'];
  if (!resp || resp.code !== '10000' || !resp.bill_download_url) return [];
  const raw = await fetchText(resp.bill_download_url);
  // 支付宝返回的是 UTF-8 文本（账单明细，含表头）；格式可能随版本变化，这里按通用 CSV 解析
  return parseAlipayCsv(raw);
}

async function getBill(provider, dateStr) {
  if (config.paymentMode === 'mock') return mockBill(provider, dateStr);
  if (provider === 'wechat') return wechatBill(dateStr);
  if (provider === 'alipay') return alipayBill(dateStr);
  return [];
}

// ---------- 简单 CSV 解析（用于真实账单，按表头定位列） ----------
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// 微信对账单：跳过前导汇总行，找到以"交易时间"开头的表头行，再解析数据行
function parseWechatCsv(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  let headerIdx = lines.findIndex((l) => l.includes('交易时间') && l.includes('商户订单号'));
  if (headerIdx === -1) return [];
  const header = splitCsvLine(lines[headerIdx]);
  const idx = (name) => header.indexOf(name);
  const iNo = idx('商户订单号');
  const iAmt = idx('订单金额');
  const iStatus = idx('交易状态');
  const out = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < header.length) continue;
    if (!cols[iNo]) continue;
    const status = String(cols[iStatus]).includes('SUCCESS') || String(cols[iStatus]).includes('成功') ? 'SUCCESS' : 'OTHER';
    out.push({ outTradeNo: cols[iNo], amount: Number(cols[iAmt]) || 0, status, provider: 'wechat' });
  }
  return out;
}

// 支付宝对账单：表头含"交易号/商户订单号/金额"等，按表头定位
function parseAlipayCsv(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  let headerIdx = lines.findIndex((l) => l.includes('商户订单号') || l.includes('订单号'));
  if (headerIdx === -1) return [];
  const header = splitCsvLine(lines[headerIdx]);
  const idx = (name) => header.findIndex((h) => h.includes(name));
  const iNo = idx('订单号');
  const iAmt = idx('金额');
  const iStatus = idx('状态') >= 0 ? idx('状态') : idx('交易状态');
  const out = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < header.length || !cols[iNo]) continue;
    const status = ['SUCCESS', '成功', '已付款', 'TRADE_SUCCESS'].some((s) => String(cols[iStatus]).includes(s)) ? 'SUCCESS' : 'OTHER';
    out.push({ outTradeNo: cols[iNo], amount: Number(cols[iAmt]) || 0, status, provider: 'alipay' });
  }
  return out;
}

function fetchBytes(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}
function fetchText(url) {
  return fetchBytes(url).then((b) => b.toString('utf8'));
}

// ---------- 对账引擎 ----------
async function reconcile(providers, dateStr) {
  const local = localPaidOrders(dateStr);
  const localMap = new Map(local.map((o) => [o.id, o]));
  const bills = [];
  for (const p of providers) {
    const entries = await getBill(p, dateStr);
    bills.push({ provider: p, entries });
  }

  const mismatches = [];
  // 1) 本地有、所有账单都没有 -> 漏单（钱没到账/回调丢失）
  for (const o of local) {
    const found = bills.some((b) => b.entries.some((e) => e.outTradeNo === o.id && e.status === 'SUCCESS'));
    if (!found) mismatches.push({ type: 'local_only', orderId: o.id, amount: o.totalAmount, desc: '本地已支付但账单无记录（可能回调丢失）' });
  }
  // 2) 账单有、本地无 -> 账外收款（本地漏单）
  for (const b of bills) {
    for (const e of b.entries) {
      if (e.status !== 'SUCCESS') continue;
      if (e.ghost) { mismatches.push({ type: 'bill_only', orderId: e.outTradeNo, provider: e.provider, amount: e.amount, desc: '账单有收款但本地无订单（幽灵/漏单）' }); continue; }
      if (!localMap.has(e.outTradeNo)) mismatches.push({ type: 'bill_only', orderId: e.outTradeNo, provider: e.provider, amount: e.amount, desc: '账单有收款但本地无订单' });
    }
  }
  // 3) 两边都存在但金额不一致 -> 金额差异
  for (const b of bills) {
    for (const e of b.entries) {
      const lo = localMap.get(e.outTradeNo);
      if (lo && Math.abs(Number(e.amount) - Number(lo.totalAmount)) > 0.001) {
        mismatches.push({ type: 'amount_mismatch', orderId: e.outTradeNo, localAmount: lo.totalAmount, billAmount: e.amount, desc: '金额不一致' });
      }
    }
  }

  const billSuccessCount = bills.reduce((s, b) => s + b.entries.filter((e) => e.status === 'SUCCESS').length, 0);
  const summary = {
    date: dateStr,
    providers,
    localPaidCount: local.length,
    billSuccessCount,
    matched: Math.max(0, local.length - mismatches.filter((m) => m.type === 'local_only').length),
    mismatched: mismatches.length,
    ok: mismatches.length === 0,
  };
  return { summary, mismatches, bills };
}

// ---------- 每日定时调度（生产用） ----------
// 每天 03:10 自动对前一天账单做对账。演示期可手动调用 reconcile()。
function startDailyScheduler() {
  const HOUR = 3, MIN = 10;
  function nextRun() {
    const now = new Date();
    const run = new Date(now);
    run.setHours(HOUR, MIN, 0, 0);
    if (run <= now) run.setDate(run.getDate() + 1);
    return run - now;
  }
  const tick = () => {
    const y = new Date(Date.now() - 86400000);
    const ds = y.toISOString().slice(0, 10);
    const providers = require('./payment').enabledProviders().filter((p) => p !== 'mock');
    if (!providers.length) { scheduleNext(); return; }
    reconcile(providers, ds)
      .then((r) => console.log(`[对账] ${ds} 完成: 本地${r.summary.localPaidCount} 账单${r.summary.billSuccessCount} 差异${r.summary.mismatched}`))
      .catch((e) => console.error(`[对账] ${ds} 失败:`, e.message));
    scheduleNext();
  };
  function scheduleNext() { setTimeout(tick, nextRun()); }
  scheduleNext();
  console.log('[对账] 每日定时调度已启动（每天 03:10）');
}

module.exports = { reconcile, localPaidOrders, startDailyScheduler };
