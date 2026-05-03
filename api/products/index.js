// ================================================
// backend/api/products/index.js
// Products API — list, search, detail, categories,
//                reviews, recommendations, views
// ================================================

const { supabaseAdmin } = require('../../config/supabase');
const { handler, authenticate, requireAdmin, validateFields, getPagination } = require('../../middleware');

module.exports = handler(async (req, res) => {
  const { method } = req;
  const parts = (req.url || '').replace(/\?.*/, '').split('/').filter(Boolean);
  // parts: ['api','products', ...rest]
  const slug     = parts[2]; // /api/products/:slug
  const sub      = parts[3]; // /api/products/:slug/reviews | recommendations

  // ---- GET /api/products ----
  if (method === 'GET' && !slug) {
    return listProducts(req, res);
  }

  // ---- GET /api/products/categories ----
  if (method === 'GET' && slug === 'categories') {
    return getCategories(req, res);
  }

  // ---- GET /api/products/search ----
  if (method === 'GET' && slug === 'search') {
    return searchProducts(req, res);
  }

  // ---- POST /api/products/view ----
  if (method === 'POST' && slug === 'view') {
    return trackView(req, res);
  }

  // ---- GET /api/products/:slug ----
  if (method === 'GET' && slug && !sub) {
    return getProduct(req, res, slug);
  }

  // ---- GET /api/products/:id/reviews ----
  if (method === 'GET' && slug && sub === 'reviews') {
    return getReviews(req, res, slug);
  }

  // ---- POST /api/products/:id/reviews ----
  if (method === 'POST' && slug && sub === 'reviews') {
    return createReview(req, res, slug);
  }

  // ---- GET /api/products/:id/recommendations ----
  if (method === 'GET' && slug && sub === 'recommendations') {
    return getRecommendations(req, res, slug);
  }

  // ---- Admin: POST /api/products ----
  if (method === 'POST' && !slug) {
    return createProduct(req, res);
  }

  // ---- Admin: PUT /api/products/:id ----
  if (method === 'PUT' && slug && !sub) {
    return updateProduct(req, res, slug);
  }

  // ---- Admin: DELETE /api/products/:id ----
  if (method === 'DELETE' && slug && !sub) {
    return deleteProduct(req, res, slug);
  }

  res.status(404).json({ error: 'Not found' });
});

// ================================================
// LIST PRODUCTS
// ================================================
async function listProducts(req, res) {
  const q = req.query;
  const { from, to, limit } = getPagination(q);

  let query = supabaseAdmin
    .from('products')
    .select(`
      id, name, slug, short_description, price, compare_price, currency,
      stock_status, product_type, rating_avg, rating_count, sale_count,
      view_count, is_featured, created_at,
      categories(name, slug),
      product_images(image_url, is_primary)
    `, { count: 'exact' })
    .eq('is_active', true);

  // Filters
  if (q.category) {
    const { data: cat } = await supabaseAdmin.from('categories').select('id').eq('slug', q.category).single();
    if (cat) query = query.eq('category_id', cat.id);
  }

  if (q.featured === 'true') query = query.eq('is_featured', true);
  if (q.sale === 'true')     query = query.not('compare_price', 'is', null).gt('compare_price', 0);
  if (q.in_stock === 'true') query = query.eq('stock_status', 'in_stock');
  if (q.min_price)           query = query.gte('price', parseFloat(q.min_price));
  if (q.max_price)           query = query.lte('price', parseFloat(q.max_price));
  if (q.rating)              query = query.gte('rating_avg', parseFloat(q.rating));
  if (q.type)                query = query.in('product_type', q.type.split(','));

  if (q.q) {
    query = query.textSearch('name', q.q, { config: 'english', type: 'websearch' });
  }

  // Sorting
  const sortMap = {
    newest:     { col: 'created_at',  asc: false },
    popular:    { col: 'sale_count',  asc: false },
    price_asc:  { col: 'price',       asc: true  },
    price_desc: { col: 'price',       asc: false },
    rating:     { col: 'rating_avg',  asc: false },
    relevance:  { col: 'created_at',  asc: false },
  };
  const sort = sortMap[q.sort] || sortMap.newest;
  query = query.order(sort.col, { ascending: sort.asc });
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  // Flatten nested joins
  const products = (data || []).map(p => ({
    ...p,
    category_name: p.categories?.name,
    category_slug: p.categories?.slug,
    primary_image: p.product_images?.find(i => i.is_primary)?.image_url || p.product_images?.[0]?.image_url || null,
    categories: undefined,
    product_images: undefined,
  }));

  res.status(200).json({ products, total: count, page: parseInt(q.page) || 1, limit });
}

// ================================================
// SEARCH PRODUCTS
// ================================================
async function searchProducts(req, res) {
  const { q, limit = 8, category } = req.query;
  if (!q) return res.status(200).json({ products: [] });

  const { data, error } = await supabaseAdmin.rpc('search_products', {
    search_query: q,
    category_slug: category || null,
    sort_by: 'relevance',
    page_num: 1,
    page_size: Math.min(20, parseInt(limit)),
  });

  if (error) throw error;
  const products = (data || []).map(p => ({ ...p, total_count: undefined }));
  res.status(200).json({ products });
}

// ================================================
// GET CATEGORIES
// ================================================
async function getCategories(req, res) {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id, name, slug, icon, image_url, description, sort_order, parent_id')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  res.status(200).json({ categories: data || [] });
}

// ================================================
// GET SINGLE PRODUCT
// ================================================
async function getProduct(req, res, slug) {
  const { data: product, error } = await supabaseAdmin
    .from('products')
    .select(`
      *,
      categories(id, name, slug),
      product_images(id, image_url, alt_text, is_primary, sort_order),
      product_variants(id, name, options, sku, price, stock_quantity, image_url, is_active)
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !product) return res.status(404).json({ error: 'Product not found' });

  const enriched = {
    ...product,
    category_name: product.categories?.name,
    category_slug: product.categories?.slug,
    images: (product.product_images || []).sort((a, b) => a.sort_order - b.sort_order),
    variants: (product.product_variants || []).filter(v => v.is_active),
    categories: undefined,
    product_images: undefined,
    product_variants: undefined,
  };

  res.status(200).json({ product: enriched });
}

// ================================================
// TRACK PRODUCT VIEW
// ================================================
async function trackView(req, res) {
  const { product_id, session_id, user_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });

  await supabaseAdmin.from('product_views').insert({
    product_id, session_id: session_id || null, user_id: user_id || null,
  });

  res.status(200).json({ ok: true });
}

// ================================================
// GET RECOMMENDATIONS
// ================================================
async function getRecommendations(req, res, productId) {
  const limit = Math.min(12, parseInt(req.query.limit) || 8);

  // Try DB function first
  const { data: recs } = await supabaseAdmin.rpc('get_recommendations', {
    p_product_id: productId, result_limit: limit,
  });

  if (recs && recs.length > 0) {
    return res.status(200).json({ products: recs });
  }

  // Fallback: same category products
  const { data: product } = await supabaseAdmin.from('products').select('category_id').eq('id', productId).single();
  if (!product) return res.status(200).json({ products: [] });

  const { data: similar } = await supabaseAdmin
    .from('products')
    .select('id, name, slug, price, compare_price, rating_avg, stock_status, product_images(image_url, is_primary)')
    .eq('category_id', product.category_id)
    .eq('is_active', true)
    .neq('id', productId)
    .order('sale_count', { ascending: false })
    .limit(limit);

  const products = (similar || []).map(p => ({
    ...p,
    primary_image: p.product_images?.find(i => i.is_primary)?.image_url || p.product_images?.[0]?.image_url || null,
    product_images: undefined,
  }));

  res.status(200).json({ products });
}

// ================================================
// GET REVIEWS
// ================================================
async function getReviews(req, res, productId) {
  const { data, error } = await supabaseAdmin
    .from('reviews')
    .select('id, rating, title, body, is_verified_purchase, created_at, profiles(full_name)')
    .eq('product_id', productId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const reviews = (data || []).map(r => ({
    ...r,
    author_name: r.profiles?.full_name || 'Anonymous',
    profiles: undefined,
  }));

  res.status(200).json({ reviews });
}

// ================================================
// CREATE REVIEW
// ================================================
async function createReview(req, res, productId) {
  const user = await authenticate(req, res);
  if (!user) return;

  const { rating, title, body } = req.body;
  validateFields(req.body, ['rating']);

  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

  // Check if verified purchase
  const { data: purchase } = await supabaseAdmin
    .from('order_items')
    .select('id')
    .eq('product_id', productId)
    .eq('orders.user_id', user.id)
    .eq('orders.payment_status', 'paid')
    .limit(1);

  const { data, error } = await supabaseAdmin.from('reviews').upsert({
    product_id: productId, user_id: user.id,
    rating: parseInt(rating), title: title || null, body: body || null,
    is_verified_purchase: !!(purchase && purchase.length > 0),
    is_approved: false,
  }, { onConflict: 'product_id,user_id' }).select().single();

  if (error) throw error;
  res.status(201).json({ review: data, message: 'Review submitted and pending approval' });
}

// ================================================
// CREATE PRODUCT (Admin)
// ================================================
async function createProduct(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { name, price, category_id, product_type = 'physical' } = req.body;
  validateFields(req.body, ['name', 'price']);

  const { slugify } = require('slugify');
  const baseSlug = slugify(name, { lower: true, strict: true });
  let slug = baseSlug;
  let attempt = 0;

  // Ensure unique slug
  while (true) {
    const { data: existing } = await supabaseAdmin.from('products').select('id').eq('slug', slug).single();
    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  const payload = {
    ...req.body, slug, is_active: req.body.is_active ?? true,
    created_by: admin.id,
  };
  delete payload.images;

  const { data, error } = await supabaseAdmin.from('products').insert(payload).select().single();
  if (error) throw error;

  // Handle images
  if (req.body.images?.length) {
    const imgRows = req.body.images.map((url, i) => ({
      product_id: data.id, image_url: url, is_primary: i === 0, sort_order: i,
    }));
    await supabaseAdmin.from('product_images').insert(imgRows);
  }

  res.status(201).json({ product: data });
}

// ================================================
// UPDATE PRODUCT (Admin)
// ================================================
async function updateProduct(req, res, productId) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const updates = { ...req.body, updated_at: new Date().toISOString() };
  delete updates.id; delete updates.images; delete updates.created_at;

  const { data, error } = await supabaseAdmin.from('products').update(updates).eq('id', productId).select().single();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Product not found' });

  res.status(200).json({ product: data });
}

// ================================================
// DELETE PRODUCT (Admin — soft delete)
// ================================================
async function deleteProduct(req, res, productId) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { error } = await supabaseAdmin.from('products').update({ is_active: false }).eq('id', productId);
  if (error) throw error;
  res.status(200).json({ success: true });
}
