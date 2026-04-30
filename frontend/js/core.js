/* ================================================
   ShopWave — Core JS Utilities
   frontend/js/core.js
   ================================================ */

'use strict';

// ================================================
// CONFIG
// ================================================
const CONFIG = {
  API_BASE: '/api',
  CURRENCY: 'NGN',
  CURRENCY_SYMBOL: '₦',
  PAYSTACK_PUBLIC_KEY: '',   // Loaded from settings API
  FLUTTERWAVE_PUBLIC_KEY: '',
  PAYPAL_CLIENT_ID: '',
};

// ================================================
// UTILITIES
// ================================================
const Utils = {
  /** Format currency */
  formatCurrency(amount, currency = CONFIG.CURRENCY_SYMBOL) {
    return `${currency}${Number(amount).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  },

  /** Format date */
  formatDate(dateStr, opts = { dateStyle: 'medium' }) {
    return new Date(dateStr).toLocaleDateString('en-NG', opts);
  },

  /** Format relative time (e.g. "2 hours ago") */
  timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return Utils.formatDate(dateStr);
  },

  /** Debounce */
  debounce(fn, delay = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  },

  /** Slug generation */
  slugify(str) {
    return str.toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  },

  /** Star rating HTML */
  stars(rating, count = null) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    let html = '';
    for (let i = 0; i < 5; i++) {
      if (i < full) html += '★';
      else if (i === full && half) html += '✦';
      else html += '☆';
    }
    const countHtml = count !== null ? `<span>(${count})</span>` : '';
    return `<span class="stars">${html}</span>${countHtml}`;
  },

  /** Get URL param */
  param(key) {
    return new URLSearchParams(window.location.search).get(key);
  },

  /** Set URL params without reload */
  setParams(params) {
    const url = new URL(window.location);
    Object.entries(params).forEach(([k, v]) => {
      if (v == null || v === '') url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    });
    history.replaceState(null, '', url.toString());
  },

  /** Sanitize HTML (basic) */
  sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /** Generate session ID for guest cart */
  getSessionId() {
    let sid = sessionStorage.getItem('sw_session');
    if (!sid) {
      sid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      sessionStorage.setItem('sw_session', sid);
    }
    return sid;
  },

  /** Discount percentage */
  discountPct(original, current) {
    if (!original || original <= current) return 0;
    return Math.round(((original - current) / original) * 100);
  },
};

// ================================================
// API CLIENT
// ================================================
const API = {
  async request(method, path, body = null, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${CONFIG.API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    });

    let data;
    try { data = await res.json(); } catch { data = {}; }

    if (!res.ok) {
      const err = new Error(data.message || data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  },

  get: (path, params) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return API.request('GET', path + q);
  },
  post:   (path, body) => API.request('POST', path, body),
  put:    (path, body) => API.request('PUT', path, body),
  patch:  (path, body) => API.request('PATCH', path, body),
  delete: (path)       => API.request('DELETE', path),

  // Upload file (multipart)
  async upload(path, formData) {
    const headers = {};
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${CONFIG.API_BASE}${path}`, { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Upload failed');
    return data;
  },
};

// ================================================
// AUTH
// ================================================
const Auth = {
  TOKEN_KEY: 'sw_token',
  USER_KEY:  'sw_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    try {
      const u = localStorage.getItem(this.USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  },

  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this._updateNavUI(user);
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this._updateNavUI(null);
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  isAdmin() {
    const u = this.getUser();
    return u && (u.role === 'admin' || u.role === 'super_admin');
  },

  async login(email, password) {
    const data = await API.post('/users/login', { email, password });
    this.setSession(data.token, data.user);
    return data;
  },

  async register(payload) {
    const data = await API.post('/users/register', payload);
    this.setSession(data.token, data.user);
    return data;
  },

  async logout() {
    try { await API.post('/users/logout', {}); } catch {}
    this.clearSession();
    window.location.href = '/';
  },

  requireAuth(redirectTo = '/pages/auth.html') {
    if (!this.isLoggedIn()) {
      window.location.href = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }
    return true;
  },

  requireAdmin() {
    if (!this.isAdmin()) {
      window.location.href = '/';
      return false;
    }
    return true;
  },

  _updateNavUI(user) {
    const guestEl   = document.getElementById('nav-guest');
    const userEl    = document.getElementById('nav-user');
    const nameEl    = document.getElementById('nav-user-name');
    const emailEl   = document.getElementById('nav-user-email');
    const avatarEl  = document.getElementById('nav-avatar-text');

    if (user) {
      if (guestEl) guestEl.classList.add('hidden');
      if (userEl)  userEl.classList.remove('hidden');
      if (nameEl)  nameEl.textContent = user.full_name || user.email;
      if (emailEl) emailEl.textContent = user.email;
      if (avatarEl) avatarEl.textContent = (user.full_name || user.email)[0].toUpperCase();
    } else {
      if (guestEl) guestEl.classList.remove('hidden');
      if (userEl)  userEl.classList.add('hidden');
    }
  },

  init() {
    const user = this.getUser();
    if (user) this._updateNavUI(user);
  },
};

// ================================================
// CART (localStorage + server sync)
// ================================================
const Cart = {
  STORAGE_KEY: 'sw_cart',

  _get() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; }
    catch { return []; }
  },

  _save(items) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    this._updateBadge();
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: items }));
  },

  items() { return this._get(); },

  count() {
    return this._get().reduce((sum, item) => sum + item.quantity, 0);
  },

  subtotal() {
    return this._get().reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  add(product, quantity = 1, variant = null) {
    const items = this._get();
    const key = product.id + (variant ? ':' + variant.id : '');
    const existing = items.find(i => i.key === key);

    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({
        key,
        id: product.id,
        variantId: variant?.id || null,
        name: product.name,
        variantName: variant?.name || null,
        price: variant?.price || product.price,
        image: product.primary_image || product.image || '',
        slug: product.slug,
        product_type: product.product_type || 'physical',
        quantity,
        stock_status: product.stock_status,
      });
    }

    this._save(items);
    Toast.success('Added to cart', product.name);
  },

  update(key, quantity) {
    const items = this._get();
    const item = items.find(i => i.key === key);
    if (!item) return;
    if (quantity <= 0) return this.remove(key);
    item.quantity = quantity;
    this._save(items);
  },

  remove(key) {
    const items = this._get().filter(i => i.key !== key);
    this._save(items);
  },

  clear() {
    this._save([]);
  },

  _updateBadge() {
    const count = this.count();
    document.querySelectorAll('[data-cart-badge]').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  },

  // Wishlist
  _wishlistKey: 'sw_wishlist',

  getWishlist() {
    try { return JSON.parse(localStorage.getItem(this._wishlistKey)) || []; }
    catch { return []; }
  },

  toggleWishlist(productId) {
    let list = this.getWishlist();
    const idx = list.indexOf(productId);
    if (idx > -1) {
      list.splice(idx, 1);
      Toast.show('Removed from wishlist', '', 'info');
    } else {
      list.push(productId);
      Toast.show('Added to wishlist', '', 'success');
    }
    localStorage.setItem(this._wishlistKey, JSON.stringify(list));
    document.dispatchEvent(new CustomEvent('wishlist:updated', { detail: list }));
    return idx === -1;
  },

  isWishlisted(productId) {
    return this.getWishlist().includes(productId);
  },

  init() {
    this._updateBadge();
  },
};

// ================================================
// TOAST NOTIFICATIONS
// ================================================
const Toast = {
  _container: null,

  _getContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.className = 'toast-container';
      document.body.appendChild(this._container);
    }
    return this._container;
  },

  show(title, message = '', type = 'default') {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', default: '🛍️' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <span class="toast__icon">${icons[type] || icons.default}</span>
      <div class="toast__body">
        <div class="toast__title">${Utils.sanitize(title)}</div>
        ${message ? `<div class="toast__msg">${Utils.sanitize(message)}</div>` : ''}
      </div>
      <button class="btn btn--ghost btn--icon" onclick="this.parentElement.remove()" style="font-size:16px;color:var(--brand-muted);margin-left:auto;">✕</button>
    `;
    this._getContainer().appendChild(el);
    setTimeout(() => el.remove(), 4000);
  },

  success: (title, msg) => Toast.show(title, msg, 'success'),
  error:   (title, msg) => Toast.show(title, msg, 'error'),
  warning: (title, msg) => Toast.show(title, msg, 'warning'),
  info:    (title, msg) => Toast.show(title, msg, 'info'),
};

// ================================================
// CART DRAWER
// ================================================
const CartDrawer = {
  _drawerEl: null,
  _overlayEl: null,

  open() {
    if (!this._drawerEl) this._init();
    this._drawerEl.classList.add('open');
    this._overlayEl.classList.add('open');
    document.body.style.overflow = 'hidden';
    this._render();
  },

  close() {
    if (this._drawerEl) this._drawerEl.classList.remove('open');
    if (this._overlayEl) this._overlayEl.classList.remove('open');
    document.body.style.overflow = '';
  },

  _init() {
    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'cart-overlay';
    this._overlayEl.onclick = () => this.close();

    this._drawerEl = document.createElement('div');
    this._drawerEl.className = 'cart-drawer';
    this._drawerEl.innerHTML = `
      <div class="cart-drawer__header">
        <div>
          <div class="cart-drawer__title">Your Cart</div>
          <div class="cart-drawer__count" id="drawer-count"></div>
        </div>
        <button class="btn btn--ghost btn--icon" onclick="CartDrawer.close()" style="font-size:22px;">✕</button>
      </div>
      <div class="cart-drawer__body" id="drawer-items"></div>
      <div class="cart-drawer__footer" id="drawer-footer"></div>
    `;

    document.body.appendChild(this._overlayEl);
    document.body.appendChild(this._drawerEl);

    document.addEventListener('cart:updated', () => this._render());
  },

  _render() {
    const items = Cart.items();
    const countEl  = document.getElementById('drawer-count');
    const itemsEl  = document.getElementById('drawer-items');
    const footerEl = document.getElementById('drawer-footer');
    if (!itemsEl) return;

    const count = Cart.count();
    if (countEl) countEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;

    if (items.length === 0) {
      itemsEl.innerHTML = `
        <div class="cart-drawer__empty">
          <div class="cart-drawer__empty-icon">🛒</div>
          <p style="font-weight:600;color:var(--brand-dark);margin-bottom:8px;">Your cart is empty</p>
          <p style="font-size:var(--text-sm);margin-bottom:20px;">Add items to get started</p>
          <button class="btn btn--primary" onclick="CartDrawer.close()">Continue Shopping</button>
        </div>`;
      footerEl.innerHTML = '';
      return;
    }

    itemsEl.innerHTML = items.map(item => `
      <div class="cart-item">
        <img class="cart-item__image" src="${Utils.sanitize(item.image) || '/assets/placeholder.svg'}"
          alt="${Utils.sanitize(item.name)}" loading="lazy" onerror="this.src='/assets/placeholder.svg'">
        <div class="cart-item__details">
          <div class="cart-item__name">${Utils.sanitize(item.name)}</div>
          ${item.variantName ? `<div class="cart-item__variant">${Utils.sanitize(item.variantName)}</div>` : ''}
          <div class="cart-item__row">
            <div class="quantity-control">
              <button class="quantity-btn" onclick="Cart.update('${item.key}', ${item.quantity - 1})">−</button>
              <input type="number" class="quantity-value" value="${item.quantity}" min="1"
                onchange="Cart.update('${item.key}', parseInt(this.value)||1)">
              <button class="quantity-btn" onclick="Cart.update('${item.key}', ${item.quantity + 1})">+</button>
            </div>
            <div class="cart-item__price">${Utils.formatCurrency(item.price * item.quantity)}</div>
          </div>
        </div>
        <button class="cart-item__remove" onclick="Cart.remove('${item.key}')" title="Remove">✕</button>
      </div>`).join('');

    const subtotal = Cart.subtotal();
    footerEl.innerHTML = `
      <div class="cart-summary-row">
        <span>Subtotal (${count} items)</span>
        <span>${Utils.formatCurrency(subtotal)}</span>
      </div>
      <div class="cart-summary-row">
        <span>Shipping</span>
        <span style="color:var(--color-success)">${subtotal >= 50000 ? 'Free' : Utils.formatCurrency(1500)}</span>
      </div>
      <div class="cart-summary-row cart-summary-row--total">
        <span>Total</span>
        <span style="color:var(--brand-primary)">${Utils.formatCurrency(subtotal >= 50000 ? subtotal : subtotal + 1500)}</span>
      </div>
      <a href="/pages/checkout.html" class="btn btn--primary btn--full btn--lg" style="margin-bottom:10px;">
        Proceed to Checkout
      </a>
      <a href="/pages/cart.html" class="btn btn--outline btn--full">View Full Cart</a>`;
  },
};

// ================================================
// NAVBAR BEHAVIORS
// ================================================
const Navbar = {
  init() {
    // Sticky shadow
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 10);
      }, { passive: true });
    }

    // Cart icon opens drawer
    document.querySelectorAll('[data-open-cart]').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); CartDrawer.open(); });
    });

    // User menu toggle
    const userMenu = document.querySelector('.user-menu');
    if (userMenu) {
      userMenu.querySelector('.user-menu__trigger')?.addEventListener('click', e => {
        e.stopPropagation();
        userMenu.classList.toggle('open');
      });
      document.addEventListener('click', () => userMenu.classList.remove('open'));
    }

    // Search
    this._initSearch();
  },

  _initSearch() {
    const input = document.getElementById('navbar-search');
    const dropdown = document.getElementById('search-dropdown');
    if (!input || !dropdown) return;

    const doSearch = Utils.debounce(async (q) => {
      if (q.length < 2) { dropdown.classList.remove('visible'); return; }
      try {
        const data = await API.get('/products/search', { q, limit: 5 });
        this._renderSearchDropdown(data.products || [], dropdown, q);
      } catch {}
    }, 300);

    input.addEventListener('input', e => doSearch(e.target.value.trim()));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        dropdown.classList.remove('visible');
        window.location.href = `/pages/shop.html?q=${encodeURIComponent(input.value)}`;
      }
      if (e.key === 'Escape') dropdown.classList.remove('visible');
    });

    document.addEventListener('click', e => {
      if (!input.contains(e.target)) dropdown.classList.remove('visible');
    });
  },

  _renderSearchDropdown(products, container, query) {
    if (!products.length) { container.classList.remove('visible'); return; }

    const items = products.slice(0, 5).map(p => `
      <a href="/pages/product.html?slug=${p.slug}" class="search-dropdown__item">
        <img class="search-dropdown__thumb" src="${p.primary_image || '/assets/placeholder.svg'}"
          alt="${Utils.sanitize(p.name)}" loading="lazy" onerror="this.src='/assets/placeholder.svg'">
        <div class="search-dropdown__info">
          <div class="search-dropdown__name">${Utils.sanitize(p.name)}</div>
          <div class="search-dropdown__price">${Utils.formatCurrency(p.price)}</div>
        </div>
      </a>`).join('');

    container.innerHTML = `
      ${items}
      <div class="search-dropdown__footer">
        <a href="/pages/shop.html?q=${encodeURIComponent(query)}" class="search-dropdown__see-all">
          See all results for "${Utils.sanitize(query)}" →
        </a>
      </div>`;
    container.classList.add('visible');
  },
};

// ================================================
// PRODUCT CARD HELPERS
// ================================================
const ProductCard = {
  render(product) {
    const discount = Utils.discountPct(product.compare_price, product.price);
    const isOut = product.stock_status === 'out_of_stock';
    const isDigital = product.product_type === 'digital';

    return `
    <div class="product-card" data-product-id="${product.id}">
      <div class="product-card__image-wrap">
        <a href="/pages/product.html?slug=${product.slug}">
          <img class="product-card__image"
            src="${product.primary_image || '/assets/placeholder.svg'}"
            alt="${Utils.sanitize(product.name)}"
            loading="lazy"
            onerror="this.src='/assets/placeholder.svg'">
        </a>
        <div class="product-card__badges">
          ${discount > 0 ? `<span class="badge badge--sale">-${discount}%</span>` : ''}
          ${isDigital ? `<span class="badge badge--digital">Digital</span>` : ''}
          ${isOut ? `<span class="badge badge--out">Out of Stock</span>` : ''}
          ${product.is_featured && !discount ? `<span class="badge badge--featured">Featured</span>` : ''}
        </div>
        <div class="product-card__actions">
          <button class="product-card__action-btn ${Cart.isWishlisted(product.id) ? 'active' : ''}"
            onclick="event.preventDefault(); Cart.toggleWishlist('${product.id}')" title="Wishlist">
            ${Cart.isWishlisted(product.id) ? '❤️' : '🤍'}
          </button>
          <a class="product-card__action-btn" href="/pages/product.html?slug=${product.slug}" title="Quick View">👁</a>
        </div>
      </div>
      <div class="product-card__body">
        ${product.category_name ? `<div class="product-card__category">${Utils.sanitize(product.category_name)}</div>` : ''}
        <a href="/pages/product.html?slug=${product.slug}" class="product-card__name">
          ${Utils.sanitize(product.name)}
        </a>
        ${product.rating_count > 0
          ? `<div class="product-card__rating">
              ${Utils.stars(product.rating_avg)}
              <span>(${product.rating_count})</span>
            </div>`
          : ''}
      </div>
      <div class="product-card__footer">
        <div class="product-card__price">
          <span class="price-current">${Utils.formatCurrency(product.price)}</span>
          ${product.compare_price ? `<span class="price-original">${Utils.formatCurrency(product.compare_price)}</span>` : ''}
        </div>
        ${!isOut
          ? `<button class="product-card__add-btn" title="Add to cart"
              onclick="Cart.add(${JSON.stringify(product).replace(/"/g, '&quot;')})">+</button>`
          : `<button class="product-card__add-btn" style="background:var(--brand-muted);cursor:not-allowed;" disabled>✕</button>`}
      </div>
    </div>`;
  },

  renderSkeleton(count = 4) {
    return Array(count).fill(`
      <div class="product-card" style="pointer-events:none;">
        <div class="product-card__image-wrap">
          <div class="skeleton" style="width:100%;height:100%;position:absolute;inset:0;"></div>
        </div>
        <div class="product-card__body" style="gap:8px;">
          <div class="skeleton" style="height:12px;width:60%;border-radius:6px;"></div>
          <div class="skeleton" style="height:14px;width:90%;border-radius:6px;"></div>
          <div class="skeleton" style="height:14px;width:70%;border-radius:6px;"></div>
        </div>
        <div class="product-card__footer">
          <div class="skeleton" style="height:20px;width:80px;border-radius:6px;"></div>
          <div class="skeleton" style="height:36px;width:36px;border-radius:50%;"></div>
        </div>
      </div>`).join('');
  },
};

// ================================================
// INIT ON DOM READY
// ================================================
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  Cart.init();
  Navbar.init();
});

// Expose globally
window.Utils = Utils;
window.API = API;
window.Auth = Auth;
window.Cart = Cart;
window.CartDrawer = CartDrawer;
window.Toast = Toast;
window.ProductCard = ProductCard;
