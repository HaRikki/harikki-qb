/* Digital Store SPA — shared by Website & Telegram Mini App */
const API = '/api';
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand?.(); }

const state = { user: null, store: {}, categories: [], cart: null, pendingPurchase: null, adminTab: '' };
const money = (v) => (state.store.currency_symbol || '$') + (v / 100).toFixed(2);

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}

function toast(msg, err = false) {
  const t = document.createElement('div');
  t.className = 'toast-msg' + (err ? ' err' : '');
  t.textContent = msg;
  document.getElementById('toast').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function icons() { lucide.createIcons(); }
function h(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function requireLogin() {
  if (state.user) return true;
  location.hash = '#/login';
  return false;
}

async function refreshUser() {
  try { state.user = await api('/users/me'); } catch { state.user = null; }
}

// ---------- Login ----------
async function tryTelegramLogin() {
  try {
    if (tg?.initData) {
      await api('/auth/telegram', { method: 'POST', body: { initData: tg.initData } });
      return true;
    }
  } catch (e) { toast('Telegram login failed: ' + e.message, true); }
  return false;
}

function renderLogin() {
  const el = h(`<div class="auth-screen"><div class="auth-box card" style="padding:32px">
    <i data-lucide="store" style="width:48px;height:48px;color:var(--primary)"></i>
    <h1 style="margin:10px 0 4px">${esc(state.store.store_name || 'Digital Store')}</h1>
    <p class="muted mb">Sign in with your Telegram account. No password needed.</p>
    <button class="tg-btn block" id="loginBtn"><i data-lucide="send"></i> Continue with Telegram</button>
    <p class="muted mt" id="loginHint"></p>
    ${state.store.allow_dev_login ? '<button class="btn ghost block mt" id="devBtn">Dev Login (demo user)</button>' : ''}
  </div></div>`);
  el.querySelector('#loginBtn').onclick = async () => {
    const ok = await tryTelegramLogin();
    if (ok) { await refreshUser(); location.hash = '#/'; }
    else el.querySelector('#loginHint').textContent =
      'Telegram login unavailable in a normal browser. Open this app from our Telegram Bot, or use dev login if enabled.';
  };
  el.querySelector('#devBtn')?.addEventListener('click', async () => {
    const id = prompt('Telegram user ID (e.g. 1000001 for the seeded demo admin):') || '1000001';
    const initData = 'user=' + encodeURIComponent(JSON.stringify({ id: Number(id), first_name: 'Dev User' })) + '&auth_date=' + Math.floor(Date.now() / 1000);
    try {
      await api('/auth/telegram', { method: 'POST', body: { initData } });
      await refreshUser(); location.hash = '#/';
    } catch (e) { toast(e.message, true); }
  });
  if (tg?.initData) el.querySelector('#loginBtn').click();
  return el;
}

// ---------- Layout helpers ----------
function topbar(title) {
  return `<div class="topbar">
    <a href="#/" class="logo"><i data-lucide="store"></i> ${esc(state.store.store_name || 'Digital Store')}</a>
    ${state.user ? `<a href="#/wallet" class="balance-pill"><i data-lucide="wallet"></i> ${money(state.user.balance)}</a>` : ''}
  </div>`;
}

function bottomNav(active) {
  const items = [['/', 'home', 'Home'], ['/categories', 'layout-grid', 'Categories'], ['/orders', 'package', 'Orders'], ['/wallet', 'wallet', 'Wallet'], ['/profile', 'user', 'Profile']];
  return `<nav class="bottom-nav">${items.map(([href, ic, label]) =>
    `<a href="#${href}" class="${active === href ? 'active' : ''}"><i data-lucide="${ic}"></i>${label}</a>`).join('')}</nav>`;
}

function page(content, opts = {}) {
  const el = h(`<div class="page-enter">
    ${opts.noTopbar ? '' : topbar()}
    ${content}
    ${opts.admin ? '' : bottomNav(opts.nav || location.hash.slice(0, location.hash.lastIndexOf('/')) || location.hash)}
  </div>`);
  icons(el);
  return el;
}

function skeletonGrid(n = 6) {
  return `<div class="grid cols2 cols3">${Array(n).fill('<div class="skeleton skeleton-card"></div>').join('')}</div>`;
}

function productCard(p) {
  const min = p.minv ?? 0;
  const discounted = p.discount_percent > 0 ? Math.floor(min * (100 - p.discount_percent) / 100) : min;
  return `<a href="#/product/${p.id}" class="product-card">
    <div class="product-cover">${p.cover_image ? `<img src="${esc(p.cover_image)}" loading="lazy" alt="">` : `<i data-lucide="package"></i>`}
      ${p.featured ? '<span class="badge blue">Featured</span>' : ''}
      ${p.discount_percent > 0 ? `<span class="badge">-${p.discount_percent}%</span>` : ''}
      ${(p.stock ?? 0) <= 0 ? '<span class="badge">Out of stock</span>' : ''}</div>
    <div class="product-info">
      <div class="product-name">${esc(p.name)}</div>
      <div class="product-meta">${esc(p.category_name || '')}</div>
      <div class="price" style="margin-top:auto">${money(discounted)}${p.discount_percent > 0 ? `<s>${money(min)}</s>` : ''}</div>
    </div></a>`;
}

function emptyState(icon, text) {
  return `<div class="empty"><i data-lucide="${icon}"></i><p>${esc(text)}</p></div>`;
}

// ---------- Home ----------
async function renderHome() {
  const el = h(`<div class="page-enter">
    ${topbar()}
    <input id="homeSearch" placeholder="Search products..." style="margin-bottom:12px" value="${esc(new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '')}">
    <div class="banner"><h2>${esc(state.store.store_name || 'Digital Store')}</h2><p class="muted" style="color:#e6f5fb">${esc(state.store.banner_text || '')}</p></div>
    ${state.user ? '' : `<div class="card mb row between"><span class="muted">Sign in to purchase with your wallet balance.</span><a class="btn sm" href="#/login">Sign in</a></div>`}
    <h2>Categories</h2><div class="chips" id="homeCats"><span class="skeleton" style="width:80px;height:32px"></span></div>
    <div class="section-head"><h2 style="margin:0">Featured</h2></div><div id="homeFeatured">${skeletonGrid(4)}</div>
    <div class="section-head"><h2 style="margin:0">New Products</h2></div><div id="homeNew">${skeletonGrid(4)}</div>
    <div class="section-head"><h2 style="margin:0">Best Sellers</h2></div><div id="homeBest">${skeletonGrid(4)}</div>
    ${bottomNav('/')}
  </div>`);
  el.querySelector('#homeSearch').oninput = debounce(async (e) => {
    location.hash = '#/products?q=' + encodeURIComponent(e.target.value);
  }, 400);
  icons(el);
  el.querySelector('#homeCats').innerHTML =
    `<a class="chip" href="#/products">All</a>` + state.categories.map(c => `<a class="chip" href="#/products?category=${c.id}">${esc(c.name)}</a>`).join('');
  const load = async (id, sort) => {
    try {
      const d = await api(`/products?featured=${id === 'homeFeatured' ? 1 : 0}&sort=${sort}&limit=4`);
      el.querySelector('#' + id).innerHTML = d.items.length ? d.items.map(productCard).join('') : emptyState('package', 'No products yet');
      icons(el);
    } catch { el.querySelector('#' + id).innerHTML = emptyState('alert-circle', 'Failed to load'); }
  };
  load('homeFeatured', 'new'); load('homeNew', 'new'); load('homeBest', 'popular');
  return el;
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- Categories ----------
async function renderCategories() {
  const el = h(`<div class="page-enter">${topbar()}<h1>Categories</h1>
    <div class="grid cols2 cols3" id="list">${skeletonGrid(6)}</div>${bottomNav('/categories')}</div>`);
  const items = state.categories.map(c => `
    <a href="#/products?category=${c.id}" class="card row" style="gap:12px">
      <span style="width:42px;height:42px;border-radius:12px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;color:var(--primary)"><i data-lucide="${esc(c.icon || 'tag')}"></i></span>
      <div><div style="font-weight:700">${esc(c.name)}</div><div class="muted">Browse products</div></div>
    </a>`).join('');
  el.querySelector('#list').innerHTML = items || emptyState('layout-grid', 'No categories');
  icons(el);
  return el;
}

// ---------- Product list ----------
async function renderProducts(params) {
  const q = params.get('q') || '', category = params.get('category') || '', sort = params.get('sort') || 'new';
  const el = h(`<div class="page-enter">${topbar()}
    <h1>Products</h1>
    <input id="q" placeholder="Search products..." value="${esc(q)}" class="mb">
    <div class="row mb">
      <select id="category" style="flex:1"><option value="">All categories</option>${state.categories.map(c => `<option value="${c.id}" ${String(c.id) === category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="sort" style="flex:1">
        ${[['new', 'Newest'], ['popular', 'Popular'], ['price_asc', 'Price ↑'], ['price_desc', 'Price ↓'], ['discount', 'Discount']].map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div id="list">${skeletonGrid(6)}</div>
    <div class="pager" id="pager"></div>
    ${bottomNav('/categories')}</div>`);
  const qEl = el.querySelector('#q');
  qEl.oninput = debounce(() => go(), 350);
  el.querySelector('#category').onchange = el.querySelector('#sort').onchange = () => go();
  icons(el);
  let data = null;
  function go(page = 1) {
    const qs = new URLSearchParams();
    if (qEl.value) qs.set('q', qEl.value);
    const cat = el.querySelector('#category').value; if (cat) qs.set('category', cat);
    qs.set('sort', el.querySelector('#sort').value); qs.set('page', page);
    history.replaceState(null, '', '#/products?' + qs.toString());
    load();
  }
  async function load() {
    el.querySelector('#list').innerHTML = skeletonGrid(6);
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    qs.set('limit', '12');
    try {
      data = await api('/products?' + qs);
      el.querySelector('#list').innerHTML = data.items.length
        ? `<div class="grid cols2 cols3">${data.items.map(productCard).join('')}</div>`
        : emptyState('search', 'No products found');
      const pages = Math.ceil(data.total / data.limit), cur = data.page;
      el.querySelector('#pager').innerHTML = pages > 1
        ? `${cur > 1 ? `<button class="btn sm ghost" data-p="${cur - 1}">Prev</button>` : ''}<span>Page ${cur} / ${pages}</span>${cur < pages ? `<button class="btn sm ghost" data-p="${cur + 1}">Next</button>` : ''}` : '';
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => go(+b.dataset.p));
      icons(el);
    } catch (e) { toast(e.message, true); }
  }
  await load();
  return el;
}

// ---------- Product detail ----------
async function renderProduct(id) {
  const el = h(`<div class="page-enter">${topbar()}<div id="body">${skeletonGrid(2)}</div></div>`);
  icons(el);
  let p, variant;
  try { p = await api('/products/' + id); } catch { el.querySelector('#body').innerHTML = emptyState('alert-circle', 'Product not found'); return el; }
  variant = p.variants[0];
  const minPrice = p.variants[0]?.price || 0;
  el.querySelector('#body').innerHTML = `
    <div class="card mb">
      <div class="product-cover" style="height:180px;border-radius:12px">${p.cover_image ? `<img src="${esc(p.cover_image)}" alt="">` : `<i data-lucide="package" style="width:56px;height:56px"></i>`}
        ${p.discount_percent > 0 ? `<span class="badge">-${p.discount_percent}% OFF</span>` : ''}</div>
      <h1 style="margin:12px 0 2px">${esc(p.name)}</h1>
      <div class="muted">${esc(p.category_name || '')} · ${p.sales} sold</div>
      <p class="mt">${esc(p.description)}</p>
      <label>Package</label>
      <div class="chips" id="variants">${p.variants.map((v, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-v="${v.id}">${esc(v.name)} — ${money(v.discount_percent ? v.price : v.price)}</button>`).join('') || '<span class="muted">No packages</span>'}</div>
      <label>Quantity</label><input type="number" id="qty" value="1" min="1" max="99" style="max-width:110px">
      <label>Promo code (optional)</label><input id="code" placeholder="e.g. WELCOME10" style="max-width:220px">
      <div class="row between mt" style="background:var(--bg);border-radius:12px;padding:14px">
        <div><div class="muted">Total</div><div class="price" style="font-size:20px" id="total"></div></div>
        <button class="btn" id="buy"><i data-lucide="shopping-cart"></i> Buy Now</button>
      </div>
      <div class="mt muted">${p.delivery_type === 'auto' ? '<i data-lucide="zap"></i> Instant automatic delivery after payment.' : '<i data-lucide="clock"></i> Delivered manually by our team (up to 24h).'}</div>
    </div>
    ${p.terms ? `<div class="card mb"><h3>Terms & Notes</h3><p class="muted mt">${esc(p.terms)}</p></div>` : ''}
    <div class="row mb">
      <button class="btn secondary sm" id="share"><i data-lucide="share-2"></i> Share</button>
      ${tg ? '<button class="btn secondary sm" id="openWeb"><i data-lucide="globe"></i> Open Website</button>' : ''}
    </div>`;
  icons(el);
  const qtyEl = el.querySelector('#qty');
  const disc = (v) => p.discount_percent > 0 ? Math.floor(v * (100 - p.discount_percent) / 100) : v;
  function total() { return disc(variant?.price || 0) * (qtyEl.value | 0 || 1); }
  el.querySelector('#total').textContent = money(total());
  qtyEl.oninput = () => el.querySelector('#total').textContent = money(total());
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    el.querySelectorAll('[data-v]').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); variant = p.variants.find(v => v.id == b.dataset.v);
    el.querySelector('#total').textContent = money(total());
  });
  el.querySelector('#share').onclick = () => {
    const url = location.origin + '/#/product/' + id;
    if (tg?.openTelegramLink) tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(p.name)}`);
    else navigator.clipboard?.writeText(url).then(() => toast('Link copied'));
  };
  el.querySelector('#openWeb')?.addEventListener('click', () => tg?.openLink?.(location.origin + '/#/product/' + id));
  el.querySelector('#buy').onclick = async () => {
    if (!requireLogin()) return;
    if (!variant || (variant.stock | 0) < 1) return toast('Out of stock', true);
    const qty = qtyEl.value | 0 || 1;
    confirmDialog(`Purchase ${esc(p.name)} (${esc(variant.name)}) x${qty} for ${money(total())}?`, async () => {
      const key = 'buy-' + variant.id + '-' + Date.now();
      try {
        const r = await api('/orders', { method: 'POST', body: { items: [{ variantId: variant.id, quantity: qty }], code: el.querySelector('#code').value.trim() || undefined, idempotencyKey: key } });
        state.user = await api('/users/me');
        toast('Order placed: ' + r.order_no);
        location.hash = '#/order/' + r.order_no;
      } catch (e) { toast(e.message, true); }
    });
  };
  return el;
}

function confirmDialog(msg, onOk) {
  const m = h(`<div class="modal-backdrop"><div class="modal">
    <h3>Confirmation</h3><p class="mt">${msg}</p>
    <div class="row mt" style="justify-content:flex-end">
      <button class="btn ghost" id="no">Cancel</button><button class="btn" id="ok">Confirm</button>
    </div></div></div>`);
  document.getElementById('app').appendChild(m);
  m.querySelector('#no').onclick = () => m.remove();
  m.querySelector('#ok').onclick = async () => { m.remove(); await onOk(); };
}

// ---------- Orders ----------
async function renderOrders() {
  if (!requireLogin()) return;
  const el = h(`<div class="page-enter">${topbar()}<h1>My Orders</h1>
    <input id="q" placeholder="Search order number..." class="mb">
    <div id="list">${skeletonGrid(3)}</div><div class="pager" id="pager"></div>${bottomNav('/orders')}</div>`);
  icons(el);
  el.querySelector('#q').oninput = debounce(() => {
    const v = el.querySelector('#q').value.trim();
    if (v.startsWith('ORD-')) location.hash = '#/order/' + v;
  }, 500);
  let cur = 1;
  async function load(page = 1) {
    cur = page;
    el.querySelector('#list').innerHTML = skeletonGrid(3);
    const d = await api('/orders?page=' + page);
    el.querySelector('#list').innerHTML = d.items.length ? d.items.map(o => `
      <a href="#/order/${esc(o.order_no)}" class="card mb row between">
        <div><b>${esc(o.order_no)}</b><div class="muted">${esc(o.created_at)} · ${money(o.total)}</div></div>
        <span class="status-pill status-${o.status}">${o.status.replace('_', ' ')}</span>
      </a>`).join('') : emptyState('package', 'No orders yet');
    const pages = Math.ceil(d.total / d.limit);
    el.querySelector('#pager').innerHTML = pages > 1 ? `${cur > 1 ? `<button class="btn sm ghost" data-p="${cur - 1}">Prev</button>` : ''}<span>${cur}/${pages}</span>${cur < pages ? `<button class="btn sm ghost" data-p="${cur + 1}">Next</button>` : ''}` : '';
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => load(+b.dataset.p));
  }
  await load();
  return el;
}

async function renderOrder(orderNo) {
  if (!requireLogin()) return;
  const el = h(`<div class="page-enter">${topbar()}<div id="body">${skeletonGrid(3)}</div></div>`);
  icons(el);
  let o; try { o = await api('/orders/' + encodeURIComponent(orderNo)); } catch { el.querySelector('#body').innerHTML = emptyState('alert-circle', 'Order not found'); return el; }
  el.querySelector('#body').innerHTML = `
    <div class="card mb">
      <div class="row between"><h1>Order ${esc(o.order_no)}</h1><span class="status-pill status-${o.status}">${o.status.replace('_', ' ')}</span></div>
      <div class="muted mt">${esc(o.created_at)}</div>
      <div class="mt">${o.items.map(i => `
        <div class="card mb" style="box-shadow:none;border:1px solid var(--border)">
          <div class="row between"><b>${esc(i.name)}</b><span class="muted">x${i.quantity}</span></div>
          <div class="muted">${esc(i.variant_name)} — ${money(i.unit_price)}</div>
          ${i.delivered ? `<div class="mt"><b>Delivered:</b>${JSON.parse(i.delivered).map(k => `<div class="code-box">${esc(k)}</div>`).join('')}</div>` : ''}
        </div>`).join('')}</div>
      <div class="row between"><span class="muted">Total</span><b>${money(o.total)}</b></div>
      ${o.discount_amount > 0 ? `<div class="row between"><span class="muted">Discount (${esc(o.discount_code || '')})</span><b style="color:var(--success)">-${money(o.discount_amount)}</b></div>` : ''}
      ${o.failure_reason ? `<p class="mt" style="color:var(--danger)"><b>Failure reason:</b> ${esc(o.failure_reason)}</p>` : ''}
      ${o.status === 'processing' ? `<button class="btn danger mt" id="cancel"><i data-lucide="x-circle"></i> Cancel & Refund</button>` : ''}
    </div>
    <div class="card mb"><h3>Status History</h3>
      ${o.history.map(s => `<div class="row mt"><span class="status-pill status-${s.status}">${s.status}</span><span class="muted">${esc(s.created_at)} ${s.note ? '— ' + esc(s.note) : ''}</span></div>`).join('')}
    </div>`;
  icons(el);
  el.querySelector('#cancel')?.addEventListener('click', () => {
    confirmDialog('Cancel this order and refund your wallet?', async () => {
      try { await api(`/orders/${encodeURIComponent(orderNo)}/cancel`, { method: 'POST' }); toast('Order cancelled & refunded'); location.reload(); }
      catch (e) { toast(e.message, true); }
    });
  });
  return el;
}

// ---------- Wallet ----------
async function renderWallet() {
  if (!requireLogin()) return;
  const el = h(`<div class="page-enter">${topbar()}<h1>Wallet</h1>
    <div class="wallet-hero mb"><div class="muted" style="color:#cdeef8">Current Balance</div>
      <div class="amount" id="bal">${skeletonGrid(0) === '' ? '' : '...'}</div>
      <button class="btn" style="background:#fff;color:var(--primary);margin-top:12px" id="deposit"><i data-lucide="plus-circle"></i> Top Up</button>
    </div>
    <div class="tabbar"><button class="active" data-t="all">All</button><button data-t="deposit">Deposits</button><button data-t="purchase">Purchases</button><button data-t="refund">Refunds</button></div>
    <div id="txs">${skeletonGrid(3)}</div>${bottomNav('/wallet')}</div>`);
  icons(el);
  const d = await api('/wallet');
  el.querySelector('#bal').textContent = money(d.balance);
  state.user.balance = d.balance;
  const filter = { all: null };
  function renderTxs(items) {
    el.querySelector('#txs').innerHTML = items.length ? items.map(t => `
      <div class="card mb row between">
        <div><b>${t.type.replace('_', ' ')}</b><div class="muted">${esc(t.tx_ref)} · ${esc(t.created_at)}</div></div>
        <b style="color:${t.amount >= 0 ? 'var(--success)' : 'var(--danger)'}">${t.amount >= 0 ? '+' : ''}${money(t.amount)}</b>
      </div>`).join('') : emptyState('receipt', 'No transactions');
  }
  renderTxs(d.transactions);
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    el.querySelectorAll('[data-t]').forEach(x => x.classList.remove('active')); b.classList.add('active');
    renderTxs(b.dataset.t === 'all' ? d.transactions : d.transactions.filter(t => t.type === b.dataset.t));
  });
  el.querySelector('#deposit').onclick = () => location.hash = '#/deposit';
  return el;
}

async function renderDeposit() {
  if (!requireLogin()) return;
  const cfg = await api('/deposits/config');
  const deps = await api('/deposits');
  const el = h(`<div class="page-enter">${topbar()}<h1>Top Up</h1>
    <div class="card mb"><h3>Payment Instructions</h3>
      <p class="muted mt">${esc(cfg.instructions)}</p>
      ${cfg.qr ? `<img src="${esc(cfg.qr)}" alt="QR" style="max-width:220px;margin-top:10px;border-radius:10px">` : ''}
      <div class="mt muted"><i data-lucide="shield-alert"></i> Balance is credited only after admin verifies your payment.</div>
    </div>
    <div class="card mb">
      <label>Amount (${esc(cfg.currency)})</label><input type="number" id="amt" min="1" step="0.01" placeholder="10.00">
      <label>Your payment reference (transaction ID / last digits)</label><input id="ref" placeholder="e.g. TRX123456">
      <button class="btn block mt" id="submit"><i data-lucide="send"></i> Submit Deposit Request</button>
    </div>
    <h3>My Deposit Requests</h3>
    ${deps.length ? deps.map(dp => `<div class="card mb row between">
      <div><b>${money(dp.amount)}</b><div class="muted">${esc(dp.created_at)}</div></div>
      <span class="status-pill status-${dp.status === 'approved' ? 'completed' : dp.status === 'rejected' ? 'failed' : 'pending_payment'}">${dp.status}</span>
    </div>`).join('') : emptyState('wallet', 'No deposit requests yet')}
  </div>`);
  icons(el);
  el.querySelector('#submit').onclick = async () => {
    try {
      const r = await api('/deposits', { method: 'POST', body: { amount: el.querySelector('#amt').value, payment_ref: el.querySelector('#ref').value, method: 'manual' } });
      toast('Deposit submitted: ' + r.reference + ' — pending admin approval');
      location.hash = '#/wallet';
    } catch (e) { toast(e.message, true); }
  };
  return el;
}

// ---------- Profile ----------
async function renderProfile() {
  if (!requireLogin()) return;
  const u = state.user = await api('/users/me');
  const el = h(`<div class="page-enter">${topbar()}<h1>Profile</h1>
    <div class="profile-head mb">
      <div class="avatar">${u.photo_url ? `<img src="${esc(u.photo_url)}" alt="">` : esc(u.display_name.slice(0, 1).toUpperCase())}</div>
      <div><b style="font-size:17px">${esc(u.display_name)}</b>
        <div class="muted">@${esc(u.username || '—')} · ID ${esc(u.telegram_id)}</div>
        <div class="muted">Joined ${esc(u.created_at)}</div></div>
    </div>
    <div class="stat-grid mb">
      <div class="stat"><div class="label"><i data-lucide="wallet"></i> Balance</div><div class="value blue">${money(u.balance)}</div></div>
      <div class="stat"><div class="label"><i data-lucide="package"></i> Orders</div><div class="value">${u.total_orders}</div></div>
      <div class="stat"><div class="label"><i data-lucide="check-circle"></i> Completed</div><div class="value green">${u.completed_orders}</div></div>
    </div>
    <a class="card mb row between" href="#/notifications"><span class="row"><i data-lucide="bell"></i> Notifications</span>${u.unread_notifications ? `<span class="badge blue">${u.unread_notifications}</span>` : '<i data-lucide="chevron-right"></i>'}</a>
    <div class="card mb row between"><span class="row"><i data-lucide="message-circle"></i> Telegram notifications</span>
      <input type="checkbox" id="notify" ${u.notify === undefined ? 'checked' : 'checked'} style="width:auto"></div>
    <a class="card mb row between" href="#/admin"><span class="row"><i data-lucide="shield"></i> Admin Panel</span><i data-lucide="chevron-right"></i></a>
    <button class="btn danger block" id="logout"><i data-lucide="log-out"></i> Log Out</button>
    ${bottomNav('/profile')}</div>`);
  icons(el);
  el.querySelector('#notify').onchange = async (e) => {
    await api('/notifications/prefs', { method: 'POST', body: { notify: e.target.checked } });
    toast('Preferences saved');
  };
  el.querySelector('#logout').onclick = async () => {
    await api('/auth/logout', { method: 'POST' });
    state.user = null; location.hash = '#/'; render();
  };
  return el;
}

async function renderNotifications() {
  if (!requireLogin()) return;
  const rows = await api('/notifications');
  const el = h(`<div class="page-enter">${topbar()}<h1>Notifications</h1>
    ${rows.length ? rows.map(n => `<div class="card mb"><b>${esc(n.title)}</b><div class="muted">${esc(n.body || '')}</div><div class="muted">${esc(n.created_at)}</div></div>`).join('') : emptyState('bell-off', 'No notifications')}</div>`);
  icons(el);
  return el;
}

// ================= ADMIN PANEL =================
async function renderAdmin() {
  let dash;
  try { dash = await api('/admin/dashboard'); } catch (e) { return loginAsAdmin(e); }
  const tabs = [
    ['dashboard', 'gauge', 'Dashboard'], ['orders', 'package', 'Orders'], ['deliveries', 'truck', 'Delivery'],
    ['products', 'boxes', 'Products'], ['categories', 'layout-grid', 'Categories'], ['users', 'users', 'Users'],
    ['payments', 'credit-card', 'Payments'], ['promotions', 'percent', 'Promotions'], ['settings', 'settings', 'Settings'], ['audit', 'scroll-text', 'Audit Logs'], ['admins', 'shield', 'Admins']
  ];
  const el = h(`<div class="page-enter">
    <div class="topbar"><a href="#/" class="logo"><i data-lucide="store"></i> Admin</a>
      <a href="#/" class="btn ghost sm" style="margin-left:auto"><i data-lucide="home"></i> Store</a></div>
    <div class="admin-layout">
      <nav class="admin-sidebar">${tabs.map(([id, ic, l]) => `<a href="#/admin/${id}" data-tab="${id}"><i data-lucide="${ic}"></i>${l}</a>`).join('')}</nav>
      <div id="adminBody"></div>
    </div></div>`);
  icons(el);
  const body = el.querySelector('#adminBody');
  const tab = location.hash.split('/')[2] || 'dashboard';
  el.querySelectorAll('[data-tab]').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));

  async function adminPage(fetcher, renderFn) {
    body.innerHTML = skeletonGrid(4);
    try { renderFn(await fetcher()); icons(el); }
    catch (e) { body.innerHTML = emptyState('lock', 'Access denied: ' + e.message); }
  }

  if (tab === 'dashboard') adminPage(() => dash, (d) => {
    body.innerHTML = `
      <div class="stat-grid mb">
        ${[['Users', d.users, ''], ['Products', d.products, ''], ['Orders', d.orders, ''], ['Pending', d.pending_orders, ''],
           ['Completed', d.completed_orders, 'green'], ['Failed', d.failed_orders, 'red'],
           ['Total Sales', money(d.total_sales), 'blue'], ['Deposits', money(d.total_deposits), 'blue'],
           ['Est. Cost', money(d.estimated_cost), ''], ['Est. Profit', money(d.estimated_profit), d.estimated_profit >= 0 ? 'green' : 'red']]
          .map(([l, v, c]) => `<div class="stat"><div class="label">${l}</div><div class="value ${c}">${v}</div></div>`).join('')}
      </div>
      <div class="card mb"><h3>Sales (last 14 days)</h3>
        <div class="row" style="align-items:flex-end;gap:4px;height:120px;margin-top:10px">
        ${d.sales_by_day.map(s => `<div title="${s.d}: ${money(s.s)}" style="flex:1;background:var(--primary);opacity:.75;border-radius:4px 4px 0 0;height:${Math.max(4, 110 * s.s / Math.max(...d.sales_by_day.map(x => x.s), 1))}px"></div>`).join('') || '<span class="muted">No sales yet</span>'}
        </div></div>
      <div class="grid cols2">
        <div class="card"><h3>Recent Orders</h3>${d.recent_orders.map(o => `<div class="row between mt"><a href="#/admin/orders">${esc(o.order_no)}</a><span class="status-pill status-${o.status}">${o.status}</span></div>`).join('') || '<span class="muted">None</span>'}</div>
        <div class="card"><h3>Recent Transactions</h3>${d.recent_txs.map(t => `<div class="row between mt"><span class="muted">${esc(t.type)} ${esc(t.tx_ref)}</span><b style="color:${t.amount >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(t.amount)}</b></div>`).join('') || '<span class="muted">None</span>'}</div>
      </div>`;
  });

  if (tab === 'orders') {
    body.innerHTML = `<div class="card mb"><div class="row">
      <input id="aq" placeholder="Search order no / user id"><select id="af" style="max-width:170px">
        <option value="">All status</option>${['pending_payment','paid','processing','completed','failed','cancelled','refunded'].map(s => `<option>${s}</option>`).join('')}</select>
      <button class="btn sm" id="as">Search</button></div></div><div id="alist">${skeletonGrid(3)}</div><div class="pager" id="apager"></div>`;
    let page = 1;
    const loadOrders = async () => {
      const d = await api(`/admin/orders?q=${encodeURIComponent(body.querySelector('#aq').value)}&status=${body.querySelector('#af').value}&page=${page}`);
      body.querySelector('#alist').innerHTML = d.items.map(o => `
        <div class="card mb row between" data-ord="${esc(o.order_no)}" style="cursor:pointer">
          <div><b>${esc(o.order_no)}</b><div class="muted">${esc(o.telegram_id)} · ${esc(o.display_name)} · ${money(o.total)}</div></div>
          <span class="status-pill status-${o.status}">${o.status.replace('_',' ')}</span></div>`).join('') || emptyState('package', 'No orders');
      const pages = Math.ceil(d.total / d.limit);
      body.querySelector('#apager').innerHTML = pages > 1 ? `${page > 1 ? `<button class="btn sm ghost" data-pg="${page - 1}">Prev</button>` : ''}<span>${page}/${pages}</span>${page < pages ? `<button class="btn sm ghost" data-pg="${page + 1}">Next</button>` : ''}` : '';
      body.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { page = +b.dataset.pg; loadOrders(); });
      body.querySelectorAll('[data-ord]').forEach(c => c.onclick = () => adminOrderDetail(c.dataset.ord));
      icons(el);
    };
    body.querySelector('#as').onclick = () => { page = 1; loadOrders(); };
    loadOrders();
    async function adminOrderDetail(orderNo) {
      const o = await api('/admin/orders/' + encodeURIComponent(orderNo));
      const m = h(`<div class="modal-backdrop"><div class="modal">
        <div class="row between"><h3>${esc(o.order_no)} <span class="status-pill status-${o.status}">${o.status}</span></h3></div>
        <div class="muted mt">User ${esc(o.telegram_id)} · ${money(o.total)} · ${esc(o.created_at)}</div>
        ${o.items.map(i => `<div class="card mt mb" style="box-shadow:none;border:1px solid var(--border)"><b>${esc(i.name)}</b> (${esc(i.variant_name)}) x${i.quantity}
          ${i.delivered ? `<div class="code-box">${JSON.parse(i.delivered).map(esc).join('<br>')}</div>` : '<div class="muted">not delivered</div>'}</div>`).join('')}
        <label>New status</label>
        <select id="os">${['processing','completed','failed','cancelled','refunded'].filter(s => s !== o.status).map(s => `<option>${s}</option>`).join('')}</select>
        <label>Note</label><input id="on_">
        ${['paid','processing'].includes(o.status) ? `<label>Manual delivery payload (sent to user)</label><textarea id="od" rows="3" placeholder="license key / account info / instructions"></textarea>
        <button class="btn block mt" id="odel"><i data-lucide="send"></i> Deliver Manually</button>` : ''}
        ${o.status === 'failed' ? `<button class="btn block mt" id="oretry"><i data-lucide="refresh-cw"></i> Retry Auto Delivery</button>` : ''}
        <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" id="oc">Close</button><button class="btn" id="ou">Update</button></div>
        <div class="mt"><b>History</b>${o.history.map(s => `<div class="muted">${esc(s.created_at)} — ${s.status} ${s.note ? '(' + esc(s.note) + ')' : ''} ${s.actor ? 'by ' + esc(s.actor) : ''}</div>`).join('')}</div>
      </div></div>`);
      document.getElementById('app').appendChild(m); icons(m);
      m.querySelector('#oc').onclick = () => m.remove();
      m.querySelector('#ou').onclick = async () => {
        try { await api(`/admin/orders/${encodeURIComponent(orderNo)}/status`, { method: 'POST', body: { status: m.querySelector('#os').value, note: m.querySelector('#on_').value } }); toast('Order updated'); m.remove(); loadOrders(); }
        catch (e) { toast(e.message, true); }
      };
      m.querySelector('#odel')?.addEventListener('click', async () => {
        try { await api(`/admin/orders/${encodeURIComponent(orderNo)}/deliver`, { method: 'POST', body: { payload: m.querySelector('#od').value } }); toast('Delivered'); m.remove(); loadOrders(); }
        catch (e) { toast(e.message, true); }
      });
      m.querySelector('#oretry')?.addEventListener('click', async () => {
        try { const r = await api(`/admin/orders/${encodeURIComponent(orderNo)}/retry-delivery`, { method: 'POST' }); toast(r.ok ? 'Retry delivered' : 'Retry failed again (refunded)'); m.remove(); loadOrders(); }
        catch (e) { toast(e.message, true); }
      });
    }
  }

  if (tab === 'deliveries') adminPage(() => api('/admin/deliveries'), (d) => {
    body.innerHTML = `
      <h2>Manual Delivery Queue</h2>${d.manual_queue.map(o => `<a class="card mb row between" href="#/admin/orders"><b>${esc(o.order_no)}</b><span class="muted">${esc(o.telegram_id)}</span><span class="status-pill status-processing">${o.status}</span></a>`).join('') || emptyState('truck', 'Queue empty')}
      <h2>Auto Delivery Failures</h2>${d.auto_queue.map(o => `<a class="card mb row between" href="#/admin/orders"><b>${esc(o.order_no)}</b><span class="status-pill status-failed">failed</span></a>`).join('') || emptyState('check-circle', 'No failures')}
      <h2>Delivery Logs</h2>${d.logs.map(l => `<div class="card mb row between"><span>${esc(l.order_no)} · ${l.type}</span><span class="status-pill status-${l.status === 'success' ? 'completed' : 'failed'}">${l.status}</span></div>`).join('') || emptyState('scroll-text', 'No logs')}`;
  });

  if (tab === 'products') {
    body.innerHTML = `<div class="row mb"><button class="btn" id="pnew"><i data-lucide="plus"></i> Add Product</button><input id="pq" placeholder="Search products..."></div>
      <div id="plist">${skeletonGrid(3)}</div>`;
    const load = async () => {
      const d = await api('/admin/products?q=' + encodeURIComponent(body.querySelector('#pq').value));
      body.querySelector('#plist').innerHTML = d.items.map(p => `
        <div class="card mb row between" data-pid="${p.id}" style="cursor:pointer">
          <div><b>${esc(p.name)}</b><div class="muted">${esc(p.category_name || '')} · ${p.delivery_type} · stock ${p.stock} · ${p.sales} sold</div></div>
          <span class="status-pill status-${p.status === 'active' ? 'completed' : 'failed'}">${p.status}</span>
        </div>`).join('') || emptyState('boxes', 'No products');
      body.querySelectorAll('[data-pid]').forEach(c => c.onclick = () => editProduct(+c.dataset.pid));
      icons(el);
    };
    body.querySelector('#pq').oninput = debounce(load, 350);
    body.querySelector('#pnew').onclick = () => editProduct(null);
    load();
    async function editProduct(id) {
      let p = { name: '', category_id: '', description: '', cost_price: 0, status: 'active', delivery_type: 'auto', featured: 0, discount_percent: 0, delivery_note: '', terms: '', cover_image: '', variants: [] };
      if (id) p = { ...await api('/admin/products/' + id), cost_price: (await api('/admin/products/' + id)).cost_price / 100 };
      const m = h(`<div class="modal-backdrop"><div class="modal" style="max-width:560px">
        <h3>${id ? 'Edit' : 'New'} Product</h3>
        <label>Name</label><input id="f_name" value="${esc(p.name)}">
        <label>Category</label><select id="f_cat"><option value="">—</option>${state.categories.map(c => `<option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <label>Cover image URL</label><input id="f_img" value="${esc(p.cover_image || '')}" placeholder="https://...">
        <label>Description</label><textarea id="f_desc" rows="2">${esc(p.description)}</textarea>
        <div class="row"><div style="flex:1"><label>Cost price</label><input id="f_cost" type="number" step="0.01" value="${p.cost_price / 100 || 0}"></div>
        <div style="flex:1"><label>Discount %</label><input id="f_disc" type="number" value="${p.discount_percent || 0}"></div></div>
        <div class="row"><div style="flex:1"><label>Status</label><select id="f_status">${['active','inactive','out_of_stock'].map(s => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div style="flex:1"><label>Delivery</label><select id="f_del"><option value="auto" ${p.delivery_type === 'auto' ? 'selected' : ''}>Auto</option><option value="manual" ${p.delivery_type === 'manual' ? 'selected' : ''}>Manual</option></select></div></div>
        <label class="row" style="margin-top:14px"><input type="checkbox" id="f_feat" ${p.featured ? 'checked' : ''} style="width:auto"> Featured product</label>
        <label>Terms / notes</label><input id="f_terms" value="${esc(p.terms || '')}">
        <h3 class="mt">Packages</h3><div id="f_vars"></div>
        <button class="btn ghost sm" id="f_addv"><i data-lucide="plus"></i> Add package</button>
        ${p.delivery_type === 'auto' || true ? `<h3 class="mt">Digital Keys (one per line, auto products)</h3><textarea id="f_keys" rows="3" placeholder="KEY-XXXX-XXXX"></textarea>` : ''}
        <div class="row mt" style="justify-content:flex-end">
          ${id ? `<button class="btn danger" id="f_del_p" style="margin-right:auto"><i data-lucide="trash-2"></i> Delete</button>` : ''}
          <button class="btn ghost" id="f_cancel">Cancel</button><button class="btn" id="f_save">Save</button></div>
      </div></div>`);
      document.getElementById('app').appendChild(m); icons(m);
      const varsBox = m.querySelector('#f_vars');
      const varRow = (v = {}) => {
        const r = h(`<div class="row mb"><input placeholder="Name" value="${esc(v.name || '')}" data-k="name" style="flex:2">
          <input placeholder="Price" type="number" step="0.01" value="${(v.price || 0) / 100}" data-k="price" style="flex:1">
          <input placeholder="Stock" type="number" value="${v.stock ?? 0}" data-k="stock" style="flex:1">
          <button class="btn ghost sm" data-k="rm">✕</button></div>`);
        if (v.id) { r.dataset.vid = v.id; r.querySelector('[data-k=rm]').remove(); r.insertAdjacentHTML('afterbegin', `<input type="hidden" value="${v.id}">`); }
        else r.querySelector('[data-k=rm]').onclick = () => r.remove();
        return r;
      };
      (p.variants || []).forEach(v => varsBox.appendChild(varRow(v)));
      m.querySelector('#f_addv').onclick = () => varsBox.appendChild(varRow());
      m.querySelector('#f_cancel').onclick = () => m.remove();
      m.querySelector('#f_save').onclick = async () => {
        const variants = [...varsBox.children].map(r => ({
          id: r.querySelector('input[type=hidden]')?.value ? +r.querySelector('input[type=hidden]').value : undefined,
          name: r.querySelector('[data-k=name]').value, price: parseFloat(r.querySelector('[data-k=price]').value) || 0,
          stock: r.querySelector('[data-k=stock]').value | 0, active: true
        }));
        const payload = {
          name: m.querySelector('#f_name').value, category_id: m.querySelector('#f_cat').value || null,
          cover_image: m.querySelector('#f_img').value, description: m.querySelector('#f_desc').value,
          cost_price: parseFloat(m.querySelector('#f_cost').value) || 0, discount_percent: m.querySelector('#f_disc').value | 0,
          status: m.querySelector('#f_status').value, delivery_type: m.querySelector('#f_del').value,
          featured: m.querySelector('#f_feat').checked, terms: m.querySelector('#f_terms').value, variants
        };
        try {
          const r = id ? await api('/admin/products/' + id, { method: 'PUT', body: payload })
                      : await api('/admin/products', { method: 'POST', body: payload });
          const keys = m.querySelector('#f_keys').value.trim();
          if (keys && payload.variants.length) {
            const vid = r.id ? (await api('/admin/products/' + r.id)).variants[0]?.id : payload.variants.find(v => !v.id);
            const target = typeof vid === 'number' ? vid : (await api('/admin/products/' + (r.id || id))).variants[0].id;
            await api('/admin/inventory', { method: 'POST', body: { variantId: target, keys } });
          }
          toast('Product saved'); m.remove(); load();
        } catch (e) { toast(e.message, true); }
      };
      m.querySelector('#f_del_p')?.addEventListener('click', () => {
        confirmDialog('Delete this product? (Products with orders are deactivated instead)', async () => {
          try { await api('/admin/products/' + id, { method: 'DELETE' }); toast('Deleted'); m.remove(); load(); }
          catch (e) { toast(e.message, true); }
        });
      });
    }
  }

  if (tab === 'categories') {
    body.innerHTML = `<button class="btn mb" id="cnew"><i data-lucide="plus"></i> Add Category</button><div id="clist">${skeletonGrid(3)}</div>`;
    const load = async () => {
      const cats = await api('/admin/categories');
      body.querySelector('#clist').innerHTML = cats.map(c => `
        <div class="card mb row between"><span class="row"><i data-lucide="${esc(c.icon || 'tag')}"></i><b>${esc(c.name)}</b></span>
          <span class="row"><span class="status-pill status-${c.active ? 'completed' : 'failed'}">${c.active ? 'active' : 'off'}</span>
          <button class="btn ghost sm" data-cid="${c.id}">Edit</button></span></div>`).join('');
      body.querySelectorAll('[data-cid]').forEach(b => b.onclick = () => {
        const c = cats.find(x => x.id == b.dataset.cid);
        const m = h(`<div class="modal-backdrop"><div class="modal"><h3>Edit Category</h3>
          <label>Name</label><input id="c_name" value="${esc(c.name)}"><label>Lucide icon</label><input id="c_icon" value="${esc(c.icon || '')}">
          <label>Sort order</label><input id="c_sort" type="number" value="${c.sort_order}">
          <label class="row" style="margin-top:14px"><input type="checkbox" id="c_act" ${c.active ? 'checked' : ''} style="width:auto"> Active</label>
          <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" id="cc">Cancel</button><button class="btn" id="cs">Save</button></div></div></div>`);
        document.getElementById('app').appendChild(m);
        m.querySelector('#cc').onclick = () => m.remove();
        m.querySelector('#cs').onclick = async () => {
          try { await api('/admin/categories/' + c.id, { method: 'PUT', body: { name: m.querySelector('#c_name').value, icon: m.querySelector('#c_icon').value, sort_order: +m.querySelector('#c_sort').value, active: m.querySelector('#c_act').checked } }); toast('Saved'); m.remove(); load(); }
          catch (e) { toast(e.message, true); }
        };
      });
      icons(el);
    };
    body.querySelector('#cnew').onclick = () => {
      const m = h(`<div class="modal-backdrop"><div class="modal"><h3>New Category</h3>
        <label>Name</label><input id="c_name"><label>Lucide icon name</label><input id="c_icon" placeholder="tag">
        <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" id="cc">Cancel</button><button class="btn" id="cs">Save</button></div></div></div>`);
      document.getElementById('app').appendChild(m);
      m.querySelector('#cc').onclick = () => m.remove();
      m.querySelector('#cs').onclick = async () => {
        try { await api('/admin/categories', { method: 'POST', body: { name: m.querySelector('#c_name').value, icon: m.querySelector('#c_icon').value, sort_order: 0, active: true } }); toast('Created'); m.remove(); load(); }
        catch (e) { toast(e.message, true); }
      };
    };
    load();
  }

  if (tab === 'users') {
    body.innerHTML = `<input id="uq" class="mb" placeholder="Search Telegram ID / username / name"><div id="ulist">${skeletonGrid(3)}</div>`;
    const load = async (page = 1) => {
      const d = await api('/admin/users?q=' + encodeURIComponent(body.querySelector('#uq').value) + '&page=' + page);
      body.querySelector('#ulist').innerHTML = d.items.map(u => `
        <div class="card mb row between" data-uid="${u.id}" style="cursor:pointer">
          <div><b>${esc(u.display_name)}</b> <span class="muted">@${esc(u.username || '—')}</span>
            <div class="muted">ID ${esc(u.telegram_id)} · ${u.orders} orders</div></div>
          <div class="row"><b>${money(u.balance)}</b>${u.is_blocked ? '<span class="status-pill status-failed">blocked</span>' : ''}</div>
        </div>`).join('') || emptyState('users', 'No users');
      body.querySelectorAll('[data-uid]').forEach(c => c.onclick = async () => {
        const u = await api('/admin/users/' + c.dataset.uid);
        const m = h(`<div class="modal-backdrop"><div class="modal"><h3>${esc(u.display_name)} <span class="muted">ID ${esc(u.telegram_id)}</span></h3>
          <div class="muted mt">Balance <b>${money(u.balance)}</b> · joined ${esc(u.created_at)}</div>
          <label>Adjust balance (+/- amount)</label><input id="ub_amt" type="number" step="0.01" placeholder="10 or -5">
          <label>Reason (required)</label><input id="ub_r">
          <button class="btn block mt" id="ub">Apply adjustment</button>
          <button class="btn secondary block mt" id="ublk">${u.is_blocked ? 'Unblock account' : 'Block account'}</button>
          <h3 class="mt">Orders</h3>${u.orders.map(o => `<div class="row between mt"><span>${esc(o.order_no)}</span><span class="status-pill status-${o.status}">${o.status}</span></div>`).join('') || '<span class="muted">None</span>'}
          <h3 class="mt">Transactions</h3>${u.transactions.map(t => `<div class="row between mt"><span class="muted">${esc(t.type)} ${esc(t.tx_ref)}</span><b>${money(t.amount)}</b></div>`).join('') || '<span class="muted">None</span>'}
          <button class="btn ghost block mt" id="uc">Close</button></div></div>`);
        document.getElementById('app').appendChild(m);
        m.querySelector('#uc').onclick = () => m.remove();
        m.querySelector('#ub').onclick = async () => {
          try { await api(`/admin/users/${u.id}/balance`, { method: 'POST', body: { amount: m.querySelector('#ub_amt').value, reason: m.querySelector('#ub_r').value } }); toast('Balance adjusted'); m.remove(); load(); }
          catch (e) { toast(e.message, true); }
        };
        m.querySelector('#ublk').onclick = async () => {
          await api(`/admin/users/${u.id}/block`, { method: 'POST', body: { block: !u.is_blocked } });
          toast(u.is_blocked ? 'Unblocked' : 'Blocked'); m.remove(); load();
        };
      });
      icons(el);
    };
    body.querySelector('#uq').oninput = debounce(load, 350);
    load();
  }

  if (tab === 'payments') {
    body.innerHTML = `<div class="tabbar mb"><button class="active" data-s="">All</button><button data-s="pending">Pending</button><button data-s="approved">Approved</button><button data-s="rejected">Rejected</button></div><div id="dlist">${skeletonGrid(3)}</div>`;
    const load = async () => {
      const s = body.querySelector('.tabbar .active').dataset.s;
      const d = await api('/admin/deposits' + (s ? '?status=' + s : ''));
      body.querySelector('#dlist').innerHTML = d.items.map(dp => `
        <div class="card mb">
          <div class="row between"><b>${money(dp.amount)}</b><span class="status-pill status-${dp.status === 'approved' ? 'completed' : dp.status === 'rejected' ? 'failed' : 'pending_payment'}">${dp.status}</span></div>
          <div class="muted mt">${esc(dp.telegram_id)} · ${esc(dp.display_name)} · ref: ${esc(dp.payment_ref || '—')} · ${esc(dp.created_at)}</div>
          ${dp.status === 'pending' ? `<div class="row mt"><button class="btn sm" data-ap="${dp.id}"><i data-lucide="check"></i> Approve</button>
            <button class="btn sm danger" data-rj="${dp.id}"><i data-lucide="x"></i> Reject</button></div>` : ''}
        </div>`).join('') || emptyState('credit-card', 'No deposits');
      body.querySelectorAll('[data-ap]').forEach(b => b.onclick = async () => {
        try { await api(`/admin/deposits/${b.dataset.ap}/approve`, { method: 'POST', body: {} }); toast('Deposit approved & credited'); load(); }
        catch (e) { toast(e.message, true); }
      });
      body.querySelectorAll('[data-rj]').forEach(b => b.onclick = async () => {
        const reason = prompt('Rejection reason:') || '';
        try { await api(`/admin/deposits/${b.dataset.rj}/reject`, { method: 'POST', body: { reason } }); toast('Rejected'); load(); }
        catch (e) { toast(e.message, true); }
      });
      icons(el);
    };
    body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { body.querySelectorAll('[data-s]').forEach(x => x.classList.remove('active')); b.classList.add('active'); load(); });
    load();
  }

  if (tab === 'promotions') {
    body.innerHTML = `<button class="btn mb" id="prnew"><i data-lucide="plus"></i> New Promo Code</button><div id="prlist">${skeletonGrid(3)}</div>`;
    const load = async () => {
      const ps = await api('/admin/promotions');
      body.querySelector('#prlist').innerHTML = ps.map(p => `
        <div class="card mb row between"><div><b>${esc(p.code)}</b>
          <div class="muted">${p.discount_type === 'percent' ? p.discount_value + '% off' : money(p.discount_value) + ' off'} · used ${p.used_count}/${p.max_uses || '∞'} ${p.ends_at ? '· until ' + esc(p.ends_at) : ''}</div></div>
          <div class="row"><span class="status-pill status-${p.active ? 'completed' : 'failed'}">${p.active ? 'active' : 'off'}</span>
          <button class="btn ghost sm" data-pr="${p.id}" data-a="${p.active ? 0 : 1}">${p.active ? 'Disable' : 'Enable'}</button></div></div>`).join('') || emptyState('percent', 'No promotions');
      body.querySelectorAll('[data-pr]').forEach(b => b.onclick = async () => {
        await api('/admin/promotions/' + b.dataset.pr, { method: 'PUT', body: { active: b.dataset.a === '1' } }); load();
      });
      icons(el);
    };
    body.querySelector('#prnew').onclick = () => {
      const m = h(`<div class="modal-backdrop"><div class="modal"><h3>New Promotion</h3>
        <label>Code</label><input id="p_code" placeholder="WELCOME10">
        <label>Type</label><select id="p_type"><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select>
        <label>Value (percent number or amount)</label><input id="p_val" type="number">
        <label>Max uses (0 = unlimited)</label><input id="p_max" type="number" value="0">
        <label>Ends at (optional)</label><input id="p_end" type="date">
        <button class="btn block mt" id="p_save">Create</button></div></div>`);
      document.getElementById('app').appendChild(m);
      m.querySelector('#p_save').onclick = async () => {
        try { await api('/admin/promotions', { method: 'POST', body: { code: m.querySelector('#p_code').value, discount_type: m.querySelector('#p_type').value, discount_value: parseFloat(m.querySelector('#p_val').value), max_uses: +m.querySelector('#p_max').value, ends_at: m.querySelector('#p_end').value || null, active: true } }); toast('Created'); m.remove(); load(); }
        catch (e) { toast(e.message, true); }
      };
    };
    load();
  }

  if (tab === 'settings') adminPage(() => api('/admin/settings'), (s) => {
    body.innerHTML = `<div class="card">
      ${['store_name', 'currency', 'currency_symbol', 'telegram_bot', 'banner_text', 'payment_qr', 'terms'].map(k =>
        `<label>${k.replace(/_/g, ' ')}</label><input data-s="${k}" value="${esc(s[k] || '')}">`).join('')}
      <label>Payment instructions</label><textarea data-s="payment_instructions" rows="3">${esc(s.payment_instructions || '')}</textarea>
      <label class="row" style="margin-top:14px"><input type="checkbox" data-s="maintenance_mode" ${s.maintenance_mode === '1' ? 'checked' : ''} style="width:auto"> Maintenance mode</label>
      <button class="btn mt" id="ssave">Save Settings</button></div>`;
    body.querySelector('#ssave').onclick = async () => {
      const payload = {};
      body.querySelectorAll('[data-s]').forEach(i => payload[i.dataset.s] = i.type === 'checkbox' ? (i.checked ? '1' : '0') : i.value);
      try { await api('/admin/settings', { method: 'PUT', body: payload }); toast('Settings saved'); }
      catch (e) { toast(e.message, true); }
    };
  });

  if (tab === 'audit') adminPage(() => api('/admin/audit-logs'), (logs) => {
    body.innerHTML = `<div class="card">${logs.length ? `<table><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th></tr>
      ${logs.map(l => `<tr><td class="muted">${esc(l.created_at)}</td><td>${esc(l.admin_id)}</td><td>${esc(l.action)}</td><td class="muted">${esc(l.target || '')}</td></tr>`).join('')}</table>` : emptyState('scroll-text', 'No audit logs')}</div>`;
  });

  if (tab === 'admins') {
    let admins = [];
    adminPage(async () => admins = await api('/admin/admins'), () => {
      body.innerHTML = `<div class="card mb">${admins.map(a => `
        <div class="row between mt"><span><b>${esc(a.telegram_id)}</b> <span class="status-pill status-paid">${a.role}</span></span>
          ${a.role === 'staff' ? `<button class="btn sm danger" data-da="${esc(a.telegram_id)}">Remove</button>` : ''}</div>`).join('')}</div>
        <div class="card"><h3>Add staff admin</h3>
        <label>Telegram User ID</label><input id="na_id">
        <label>Permissions (comma)</label><input id="na_p" value="orders,payments" placeholder="orders,payments,catalog,users">
        <button class="btn mt" id="na_add">Add</button></div>`;
      body.querySelectorAll('[data-da]').forEach(b => b.onclick = async () => {
        await api('/admin/admins/' + b.dataset.da, { method: 'DELETE' }); toast('Removed'); renderAdmin(); location.reload();
      });
      body.querySelector('#na_add').onclick = async () => {
        try { await api('/admin/admins', { method: 'POST', body: { telegramId: body.querySelector('#na_id').value, role: 'staff', permissions: body.querySelector('#na_p').value.split(',').map(s => s.trim()).filter(Boolean) } }); toast('Added'); location.reload(); }
        catch (e) { toast(e.message, true); }
      };
    });
  }

  return el;
}

function loginAsAdmin() {
  return h(`<div class="auth-screen"><div class="auth-box card" style="padding:32px">
    <i data-lucide="shield-off" style="width:44px;height:44px;color:var(--danger)"></i>
    <h1>Admin access required</h1><p class="muted">Sign in with a Telegram account whose ID is listed in ADMIN_TELEGRAM_IDS, then open Admin Panel from your profile.</p>
    <a class="btn block" href="#/login">Sign in</a></div></div>`);
}

// ================= ROUTER =================
async function render() {
  const hash = location.hash || '#/';
  const [pathPart, qs] = hash.slice(1).split('?');
  const params = new URLSearchParams(qs || '');
  const seg = pathPart.split('/').filter(Boolean);
  const app = document.getElementById('app');
  app.innerHTML = '';

  let el;
  if (seg[0] === 'login') el = await renderLogin();
  else if (seg[0] === undefined) el = await renderHome();
  else if (seg[0] === 'categories') el = await renderCategories();
  else if (seg[0] === 'products') el = await renderProducts(params);
  else if (seg[0] === 'product') el = await renderProduct(seg[1]);
  else if (seg[0] === 'orders') el = await renderOrders();
  else if (seg[0] === 'order') el = await renderOrder(seg[1]);
  else if (seg[0] === 'wallet') el = await renderWallet();
  else if (seg[0] === 'deposit') el = await renderDeposit();
  else if (seg[0] === 'profile') el = await renderProfile();
  else if (seg[0] === 'notifications') el = await renderNotifications();
  else if (seg[0] === 'admin') el = await renderAdmin();
  else el = h(`<div class="page-enter">${topbar()}${emptyState('compass', 'Page not found')}<a class="btn" href="#/">Back home</a></div>`);
  app.appendChild(el);
  icons();
}

(async function init() {
  try { state.store = await api('/store-info'); } catch { state.store = {}; }
  try { state.categories = await api('/categories'); } catch { state.categories = []; }
  if (tg?.initData) await tryTelegramLogin();
  await refreshUser();
  if (!location.hash) location.hash = '#/';
  window.addEventListener('hashchange', render);
  render();
})();
