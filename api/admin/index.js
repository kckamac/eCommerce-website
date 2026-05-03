// ================================================
// backend/api/admin/index.js
// Admin API — dashboard, products, orders, customers
// ================================================

const { supabaseAdmin } = require('../../backend/config/supabase');
const { handler, requireAdmin, getPagination } = require('../../backend/middleware');

module.exports = handler(async (req, res) => {
  const { method } = req;
  const parts = (req.url || '').replace(/\?.*/, '').split('/').filter(Boolean);
  const section = parts[2]; // dashboard | products | orders | customers | settings | coupons
  const id      = parts[3];
  const sub     = parts[4];

  if (method === 'GET' && section === 'dashboard') return getDashboard(req, res);
  if (section === 'products') return handleProducts(req, res, method, id, sub);
  if (section === 'orders')   return handleOrders(req, res, method, id);
  if (section === 'customers') return handleCustomers(req, res, method, id);
  if (section === 'settings') return handleSettings(req, res, method);
  if (section === 'coupons')  return handleCoupons(req, res, method, id);
  if (section === 'categories') return handleCategories(req, res, method, id);
  if (section === 'reviews')  return handleReviews(req, res, method, id);

  res.status(404).json({ error: 'Not found' });
});

// ================================================
// DASHBOARD
// ================================================
async function getDashboard(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { data: stats } = await supabaseAdmin.from('admin_dashboard_stats').select('*').single();

  // Recent orders
  const { data: recentOrders } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status, payment_status, total, created_at, profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(5);

  // Top products
  const { data: topProducts } = await supabaseAdmin
    .from('products')
    .select('id, name, slug, sale_count, price, product_images(image_url, is_primary)')
    .eq('is_active', true)
    .order('sale_count', { ascending: false })
    .limit(5);

  // Revenue by month (last 6)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: revenueData } = await supabaseAdmin
    .from('orders')
    .select('total, created_at')
    .eq('payment_status', 'paid')
    .gte('created_at', sixMonthsAgo.toISOString());

  const monthlyRevenue = {};
  (revenueData || []).forEach(o => {
    const d = new Date(o.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyRevenue[key] = (monthlyRevenue[key] || 0) + parseFloat(o.total);
  });

  res.status(200).json({
    stats,
    recentOrders: (recentOrders || []).map(o => ({
      ...o,
      customer_name: o.profiles?.full_name || o.profiles?.email || 'Guest',
      profiles: undefined,
    })),
    topProducts: (topProducts || []).map(p => ({
      ...p,
      primary_image: p.product_images?.find(i => i.is_primary)?.image_url || p.product_images?.[0]?.image_url,
      product_images: undefined,
    })),
    monthlyRevenue,
  });
}

// ================================================
// PRODUCTS (Admin full CRUD)
// ================================================
async function handleProducts(req, res, method, id, sub) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { from, to, limit } = getPagination(req.query);
  const q = req.query;

  if (method === 'GET' && !id) {
    // List all products (including inactive)
    let query = supabaseAdmin
      .from('products')
      .select(`*, categories(name, slug), product_images(image_url, is_primary)`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (q.search)   query = query.ilike('name', `%${q.search}%`);
    if (q.category) query = query.eq('category_id', q.category);
    if (q.status)   query = query.eq('stock_status', q.status);
    if (q.active !== undefined) query = query.eq('is_active', q.active === 'true');

    const { data, error, count } = await query;
    if (error) throw error;

    const products = (data || []).map(p => ({
      ...p,
      category_name: p.categories?.name,
      primary_image: p.product_images?.find(i => i.is_primary)?.image_url || p.product_images?.[0]?.image_url,
      categories: undefined,
      product_images: undefined,
    }));

    return res.status(200).json({ products, total: count });
  }

  if (method === 'GET' && id) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*, categories(*), product_images(*), product_variants(*)')
      .eq('id', id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Product not found' });
    return res.status(200).json({ product: data });
  }

  if (method === 'POST' && !id) {
    const { name, price, category_id, product_type = 'physical', images = [] } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'name and price required' });

    // Generate unique slug
    const slug = await generateUniqueSlug(name);

    const payload = { ...req.body, slug };
    delete payload.images;

    const { data, error } = await supabaseAdmin.from('products').insert(payload).select().single();
    if (error) throw error;

    if (images.length) {
      await supabaseAdmin.from('product_images').insert(
        images.map((url, i) => ({ product_id: data.id, image_url: url, is_primary: i === 0, sort_order: i }))
      );
    }

    return res.status(201).json({ product: data });
  }

  if (method === 'PUT' && id) {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id; delete updates.images; delete updates.created_at;

    const { data, error } = await supabaseAdmin.from('products').update(updates).eq('id', id).select().single();
    if (error) throw error;

    // Handle image replacement
    if (req.body.images?.length) {
      await supabaseAdmin.from('product_images').delete().eq('product_id', id);
      await supabaseAdmin.from('product_images').insert(
        req.body.images.map((url, i) => ({ product_id: id, image_url: url, is_primary: i === 0, sort_order: i }))
      );
    }

    return res.status(200).json({ product: data });
  }

  if (method === 'DELETE' && id) {
    // Soft delete
    await supabaseAdmin.from('products').update({ is_active: false }).eq('id', id);
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ================================================
// ORDERS (Admin)
// ================================================
async function handleOrders(req, res, method, id) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { from, to } = getPagination(req.query);
  const q = req.query;

  if (method === 'GET' && !id) {
    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, status, payment_status, payment_method,
        total, currency, created_at,
        profiles(full_name, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (q.status)         query = query.eq('status', q.status);
    if (q.payment_status) query = query.eq('payment_status', q.payment_status);
    if (q.search)         query = query.ilike('order_number', `%${q.search}%`);
    if (q.from_date)      query = query.gte('created_at', q.from_date);
    if (q.to_date)        query = query.lte('created_at', q.to_date);

    const { data, error, count } = await query;
    if (error) throw error;

    const orders = (data || []).map(o => ({
      ...o,
      customer_name: o.profiles?.full_name || o.guest_email || 'Guest',
      customer_email: o.profiles?.email || o.guest_email,
      profiles: undefined,
    }));

    return res.status(200).json({ orders, total: count });
  }

  if (method === 'GET' && id) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*), order_status_history(*), profiles(full_name, email, phone)')
      .eq('id', id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Order not found' });
    return res.status(200).json({ order: data });
  }

  if (method === 'PATCH' && id) {
    const { status, payment_status, tracking_number, note } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (status) {
      updates.status = status;
      if (status === 'shipped')   updates.shipped_at = new Date().toISOString();
      if (status === 'delivered') updates.delivered_at = new Date().toISOString();
      if (status === 'cancelled') updates.cancelled_at = new Date().toISOString();
    }
    if (payment_status)  updates.payment_status = payment_status;
    if (tracking_number) updates.tracking_number = tracking_number;

    const { data, error } = await supabaseAdmin.from('orders').update(updates).eq('id', id).select().single();
    if (error) throw error;

    await supabaseAdmin.from('order_status_history').insert({
      order_id: id, status: status || payment_status || 'updated',
      note: note || null, created_by: admin.id,
    });

    return res.status(200).json({ order: data });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ================================================
// CUSTOMERS (Admin)
// ================================================
async function handleCustomers(req, res, method, id) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { from, to } = getPagination(req.query);
  const q = req.query;

  if (method === 'GET' && !id) {
    let query = supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, phone, role, is_active, created_at', { count: 'exact' })
      .eq('role', 'customer')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (q.search) query = query.or(`email.ilike.%${q.search}%,full_name.ilike.%${q.search}%`);
    if (q.active !== undefined) query = query.eq('is_active', q.active === 'true');

    const { data, error, count } = await query;
    if (error) throw error;
    return res.status(200).json({ customers: data || [], total: count });
  }

  if (method === 'GET' && id) {
    const { data: customer } = await supabaseAdmin.from('profiles').select('*').eq('id', id).single();
    const { data: orders, count } = await supabaseAdmin
      .from('orders').select('id, order_number, total, status, created_at', { count: 'exact' })
      .eq('user_id', id).order('created_at', { ascending: false }).limit(10);

    const totalSpend = (orders || []).reduce((s, o) => s + o.total, 0);
    return res.status(200).json({ customer, orders: orders || [], totalOrders: count, totalSpend });
  }

  if (method === 'PATCH' && id) {
    const { is_active, role } = req.body;
    const updates = {};
    if (is_active !== undefined) updates.is_active = is_active;
    if (role && admin.role === 'super_admin') updates.role = role;

    const { data, error } = await supabaseAdmin.from('profiles').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return res.status(200).json({ customer: data });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ================================================
// SETTINGS
// ================================================
async function handleSettings(req, res, method) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (method === 'GET') {
    const { data } = await supabaseAdmin.from('settings').select('*');
    const settings = Object.fromEntries((data || []).map(s => [s.key, s.value]));
    return res.status(200).json({ settings });
  }

  if (method === 'PUT') {
    const updates = Object.entries(req.body).map(([key, value]) => ({
      key, value: typeof value === 'string' ? `"${value}"` : JSON.stringify(value),
      updated_at: new Date().toISOString(),
    }));

    await supabaseAdmin.from('settings').upsert(updates, { onConflict: 'key' });
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ================================================
// COUPONS
// ================================================
async function handleCoupons(req, res, method, id) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (method === 'GET' && !id) {
    const { data } = await supabaseAdmin.from('coupons').select('*').order('created_at', { ascending: false });
    return res.status(200).json({ coupons: data || [] });
  }

  if (method === 'POST') {
    const { code, type, value } = req.body;
    if (!code || !type || !value) return res.status(400).json({ error: 'code, type, and value required' });
    const { data, error } = await supabaseAdmin.from('coupons').insert({ ...req.body, code: code.toUpperCase() }).select().single();
    if (error) throw error;
    return res.status(201).json({ coupon: data });
  }

  if (method === 'PUT' && id) {
    const { data, error } = await supabaseAdmin.from('coupons').update(req.body).eq('id', id).select().single();
    if (error) throw error;
    return res.status(200).json({ coupon: data });
  }

  if (method === 'DELETE' && id) {
    await supabaseAdmin.from('coupons').delete().eq('id', id);
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ================================================
// CATEGORIES
// ================================================
async function handleCategories(req, res, method, id) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (method === 'GET') {
    const { data } = await supabaseAdmin.from('categories').select('*').order('sort_order');
    return res.status(200).json({ categories: data || [] });
  }

  if (method === 'POST') {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const slug = await generateUniqueSlug(name, 'categories');
    const { data, error } = await supabaseAdmin.from('categories').insert({ ...req.body, slug }).select().single();
    if (error) throw error;
    return res.status(201).json({ category: data });
  }

  if (method === 'PUT' && id) {
    const { data, error } = await supabaseAdmin.from('categories').update(req.body).eq('id', id).select().single();
    if (error) throw error;
    return res.status(200).json({ category: data });
  }

  if (method === 'DELETE' && id) {
    await supabaseAdmin.from('categories').update({ is_active: false }).eq('id', id);
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ================================================
// REVIEWS (Admin moderate)
// ================================================
async function handleReviews(req, res, method, id) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (method === 'GET') {
    const { from, to } = getPagination(req.query);
    const q = req.query;
    let query = supabaseAdmin
      .from('reviews')
      .select('*, profiles(full_name, email), products(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (q.approved !== undefined) query = query.eq('is_approved', q.approved === 'true');
    const { data, error, count } = await query;
    if (error) throw error;
    return res.status(200).json({ reviews: data || [], total: count });
  }

  if ((method === 'PATCH' || method === 'PUT') && id) {
    const { is_approved } = req.body;
    const { data, error } = await supabaseAdmin.from('reviews').update({ is_approved }).eq('id', id).select().single();
    if (error) throw error;
    return res.status(200).json({ review: data });
  }

  if (method === 'DELETE' && id) {
    await supabaseAdmin.from('reviews').delete().eq('id', id);
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ================================================
// SLUG HELPER
// ================================================
async function generateUniqueSlug(name, table = 'products') {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  let slug = base;
  let i = 0;
  while (true) {
    const { data } = await supabaseAdmin.from(table).select('id').eq('slug', slug).single();
    if (!data) break;
    slug = `${base}-${++i}`;
  }
  return slug;
}
