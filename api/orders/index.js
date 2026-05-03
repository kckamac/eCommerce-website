// ================================================
// backend/api/orders/index.js
// Orders API — create, list, detail, status, coupon
// ================================================

const { supabaseAdmin } = require('../../backend/config/supabase');
const { handler, authenticate, requireAdmin, validateFields, getPagination } = require('../../backend/middleware');

module.exports = handler(async (req, res) => {
  const { method } = req;
  const parts = (req.url || '').replace(/\?.*/, '').split('/').filter(Boolean);
  const orderId = parts[2]; // /api/orders/:id
  const sub     = parts[3]; // /api/orders/:id/status

  // GET /api/orders  — user: own orders | admin: all orders
  if (method === 'GET' && !orderId) return listOrders(req, res);

  // GET /api/orders/:orderNumber
  if (method === 'GET' && orderId && !sub) return getOrder(req, res, orderId);

  // POST /api/orders — create order
  if (method === 'POST' && !orderId) return createOrder(req, res);

  // PATCH /api/orders/:id/status — admin update status
  if (method === 'PATCH' && orderId && sub === 'status') return updateStatus(req, res, orderId);

  // POST /api/orders/apply-coupon
  if (method === 'POST' && orderId === 'apply-coupon') return applyCoupon(req, res);

  res.status(404).json({ error: 'Not found' });
});

// ================================================
// LIST ORDERS
// ================================================
async function listOrders(req, res) {
  const isAdminRoute = req.url.includes('/admin/');
  let userId = null;

  if (isAdminRoute) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
  } else {
    const user = await authenticate(req, res);
    if (!user) return;
    userId = user.id;
  }

  const { from, to, limit } = getPagination(req.query);
  const q = req.query;

  let query = supabaseAdmin
    .from('orders')
    .select(`
      id, order_number, status, payment_status, payment_method,
      total, currency, created_at, updated_at,
      order_items(id, product_name, product_image, quantity, unit_price, total_price, product_type)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (userId) query = query.eq('user_id', userId);
  if (q.status) query = query.eq('status', q.status);
  if (q.payment_status) query = query.eq('payment_status', q.payment_status);
  if (q.search) query = query.ilike('order_number', `%${q.search}%`);

  const { data, error, count } = await query;
  if (error) throw error;

  res.status(200).json({ orders: data || [], total: count });
}

// ================================================
// GET SINGLE ORDER
// ================================================
async function getOrder(req, res, orderRef) {
  // Allow fetching by order number (public for confirmation page)
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      order_items(
        id, product_id, product_name, product_image, variant_name,
        sku, quantity, unit_price, total_price, product_type,
        download_url, download_expires_at
      ),
      order_status_history(status, note, created_at)
    `)
    .or(`order_number.eq.${orderRef},id.eq.${orderRef}`)
    .single();

  if (error || !order) return res.status(404).json({ error: 'Order not found' });

  // Non-admins can only see their own orders
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user && order.user_id && order.user_id !== user.id) {
      // Check if admin
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
      if (!['admin', 'super_admin'].includes(profile?.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
  }

  // Enrich with contact email
  const enriched = {
    ...order,
    email: order.guest_email || (order.user_id ? (
      await supabaseAdmin.from('profiles').select('email').eq('id', order.user_id).single()
    ).data?.email : null),
  };

  res.status(200).json({ order: enriched });
}

// ================================================
// CREATE ORDER
// ================================================
async function createOrder(req, res) {
  const body = req.body;
  validateFields(body, ['items', 'total', 'payment_method']);

  if (!body.items?.length) return res.status(400).json({ error: 'Cart is empty' });

  // Optionally get logged-in user
  let userId = null;
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token).catch(() => ({ data: {} }));
    userId = user?.id || null;
  }

  // Validate stock and fetch current prices
  const productIds = body.items.map(i => i.product_id);
  const { data: products, error: prodErr } = await supabaseAdmin
    .from('products')
    .select('id, name, price, stock_status, stock_quantity, track_inventory, product_type')
    .in('id', productIds)
    .eq('is_active', true);

  if (prodErr) throw prodErr;

  const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));

  // Build order items with server-side prices (prevent price tampering)
  let subtotal = 0;
  const orderItems = [];

  for (const item of body.items) {
    const p = productMap[item.product_id];
    if (!p) return res.status(400).json({ error: `Product ${item.product_id} not found` });

    // Check stock for physical products
    if (p.product_type !== 'digital' && p.stock_status === 'out_of_stock') {
      return res.status(400).json({ error: `"${p.name}" is out of stock` });
    }
    if (p.track_inventory && p.product_type !== 'digital' && p.stock_quantity < item.quantity) {
      return res.status(400).json({ error: `Only ${p.stock_quantity} of "${p.name}" in stock` });
    }

    // Use variant price if provided, else product price
    let unitPrice = p.price;
    if (item.variant_id) {
      const { data: variant } = await supabaseAdmin
        .from('product_variants').select('price').eq('id', item.variant_id).single();
      if (variant?.price) unitPrice = variant.price;
    }

    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    orderItems.push({
      product_id: p.id,
      variant_id: item.variant_id || null,
      product_name: p.name,
      product_image: null, // Will be set below
      sku: item.sku || null,
      quantity: item.quantity,
      unit_price: unitPrice,
      total_price: lineTotal,
      product_type: p.product_type,
    });
  }

  // Fetch primary images for order items
  for (const item of orderItems) {
    const { data: img } = await supabaseAdmin
      .from('product_images').select('image_url').eq('product_id', item.product_id).eq('is_primary', true).single();
    item.product_image = img?.image_url || null;
  }

  // Validate coupon server-side
  let discountAmount = 0;
  let couponId = null;
  if (body.coupon_code) {
    const { data: couponResult } = await supabaseAdmin.rpc('apply_coupon', {
      coupon_code_input: body.coupon_code, order_subtotal: subtotal,
    });
    if (couponResult?.valid) {
      discountAmount = couponResult.discount;
      couponId = couponResult.coupon_id;
    }
  }

  const shippingAmount = body.shipping_amount ?? (subtotal >= 50000 ? 0 : 1500);
  const taxAmount = 0; // Can add tax logic here
  const total = Math.max(0, subtotal - discountAmount + shippingAmount + taxAmount);

  // Create the order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      user_id: userId,
      guest_email: !userId ? (body.contact?.email || null) : null,
      status: 'pending',
      payment_status: 'unpaid',
      payment_method: body.payment_method,
      currency: 'NGN',
      subtotal,
      discount_amount: discountAmount,
      shipping_amount: shippingAmount,
      tax_amount: taxAmount,
      total,
      coupon_id: couponId,
      coupon_code: body.coupon_code || null,
      shipping_address: body.shipping_address || null,
      billing_address: body.billing_address || null,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (orderErr) throw orderErr;

  // Insert order items
  const { error: itemsErr } = await supabaseAdmin
    .from('order_items')
    .insert(orderItems.map(item => ({ ...item, order_id: order.id })));

  if (itemsErr) throw itemsErr;

  // Increment coupon used_count
  if (couponId) {
    await supabaseAdmin.from('coupons').update({ used_count: supabaseAdmin.raw('used_count + 1') }).eq('id', couponId);
  }

  // Initial status history
  await supabaseAdmin.from('order_status_history').insert({
    order_id: order.id, status: 'pending', note: 'Order created',
  });

  res.status(201).json({ order, message: 'Order created successfully' });
}

// ================================================
// UPDATE ORDER STATUS (Admin)
// ================================================
async function updateStatus(req, res, orderId) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

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

  const { data, error } = await supabaseAdmin.from('orders').update(updates).eq('id', orderId).select().single();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Order not found' });

  // Log history
  await supabaseAdmin.from('order_status_history').insert({
    order_id: orderId,
    status: status || payment_status || 'updated',
    note: note || null,
    created_by: admin.id,
  });

  // Handle digital download links on payment
  if (payment_status === 'paid') {
    await generateDigitalDownloads(orderId);
  }

  res.status(200).json({ order: data });
}

// ================================================
// GENERATE DIGITAL DOWNLOAD LINKS
// ================================================
async function generateDigitalDownloads(orderId) {
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('id, product_id, product_type')
    .eq('order_id', orderId)
    .eq('product_type', 'digital');

  if (!items?.length) return;

  for (const item of items) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('digital_file_url, download_limit')
      .eq('id', item.product_id)
      .single();

    if (!product?.digital_file_url) continue;

    // Generate signed URL (valid 7 days) via Supabase Storage
    const path = product.digital_file_url.replace(/.*\/storage\/v1\/object\/[^/]+\//, '');
    const { data: signed } = await supabaseAdmin.storage
      .from(process.env.STORAGE_BUCKET || 'product-files')
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

    if (signed?.signedUrl) {
      await supabaseAdmin.from('order_items').update({
        download_url: signed.signedUrl,
        download_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', item.id);
    }
  }
}

// ================================================
// APPLY COUPON
// ================================================
async function applyCoupon(req, res) {
  const { code, subtotal } = req.body;
  if (!code || !subtotal) return res.status(400).json({ error: 'code and subtotal required' });

  const { data, error } = await supabaseAdmin.rpc('apply_coupon', {
    coupon_code_input: code,
    order_subtotal: parseFloat(subtotal),
  });

  if (error) throw error;
  res.status(200).json(data || { valid: false, error: 'Invalid coupon' });
}
