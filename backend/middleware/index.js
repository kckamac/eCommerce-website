// ================================================
// backend/middleware/index.js
// Auth middleware, CORS, error handling helpers
// ================================================

const { supabaseAdmin } = require('../config/supabase');

// ================================================
// CORS headers (applied to every response)
// ================================================
function setCors(res, req) {
  const allowed = process.env.NEXT_PUBLIC_SITE_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ================================================
// Auth middleware
// ================================================
async function authenticate(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const token = auth.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }

  // Get profile with role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile?.is_active) {
    res.status(403).json({ error: 'Account is disabled' });
    return null;
  }

  return profile;
}

// ================================================
// Admin guard
// ================================================
async function requireAdmin(req, res) {
  const user = await authenticate(req, res);
  if (!user) return null;
  if (!['admin', 'super_admin'].includes(user.role)) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return user;
}

// ================================================
// Handler wrapper with error catching + CORS
// ================================================
function handler(fn) {
  return async (req, res) => {
    setCors(res, req);
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    try {
      await fn(req, res);
    } catch (err) {
      console.error('[API Error]', err);
      const status = err.status || err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Internal server error' });
    }
  };
}

// ================================================
// Validate required fields
// ================================================
function validateFields(body, fields) {
  const missing = fields.filter(f => body[f] == null || body[f] === '');
  if (missing.length > 0) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }
}

// ================================================
// Pagination helper
// ================================================
function getPagination(query) {
  const page  = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;
  return { page, limit, from, to };
}

module.exports = { setCors, authenticate, requireAdmin, handler, validateFields, getPagination };
