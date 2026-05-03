// ================================================
// backend/api/users/index.js
// Users API — register, login, profile, addresses
// ================================================

const { supabaseAdmin } = require('../../config/supabase');
const { handler, authenticate, validateFields, getPagination } = require('../../middleware');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = handler(async (req, res) => {
  const { method } = req;
  const parts = (req.url || '').replace(/\?.*/, '').split('/').filter(Boolean);
  const action = parts[2]; // /api/users/:action

  if (method === 'POST' && action === 'register') return register(req, res);
  if (method === 'POST' && action === 'login')    return login(req, res);
  if (method === 'POST' && action === 'logout')   return logout(req, res);
  if (method === 'GET'  && action === 'profile')  return getProfile(req, res);
  if (method === 'PUT'  && action === 'profile')  return updateProfile(req, res);
  if (method === 'GET'  && action === 'addresses') return getAddresses(req, res);
  if (method === 'POST' && action === 'addresses') return createAddress(req, res);
  if (method === 'PUT'  && action === 'addresses') return updateAddress(req, res, parts[3]);
  if (method === 'DELETE' && action === 'addresses') return deleteAddress(req, res, parts[3]);

  res.status(404).json({ error: 'Not found' });
});

// ================================================
// REGISTER
// ================================================
async function register(req, res) {
  const { email, password, full_name, phone } = req.body;
  validateFields(req.body, ['email', 'password']);

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Create auth user via Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true, // Auto-confirm for now; set to false for email verification
    user_metadata: { full_name, phone },
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    throw authError;
  }

  // Create profile
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      email: email.toLowerCase().trim(),
      full_name: full_name || null,
      phone: phone || null,
      role: 'customer',
    })
    .select()
    .single();

  if (profileError) throw profileError;

  // Generate JWT
  const token = generateToken(profile);

  res.status(201).json({
    token,
    user: { id: profile.id, email: profile.email, full_name: profile.full_name, role: profile.role },
    message: 'Account created successfully',
  });
}

// ================================================
// LOGIN
// ================================================
async function login(req, res) {
  const { email, password } = req.body;
  validateFields(req.body, ['email', 'password']);

  // Sign in via Supabase Auth
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Get profile
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, phone, role, is_active, avatar_url')
    .eq('id', data.user.id)
    .single();

  if (profileErr || !profile) {
    return res.status(401).json({ error: 'User profile not found' });
  }

  if (!profile.is_active) {
    return res.status(403).json({ error: 'Your account has been disabled. Contact support.' });
  }

  const token = generateToken(profile);

  res.status(200).json({
    token,
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      phone: profile.phone,
      role: profile.role,
      avatar_url: profile.avatar_url,
    },
  });
}

// ================================================
// LOGOUT
// ================================================
async function logout(req, res) {
  // JWT is stateless — client discards token
  // Optionally: blacklist token in Redis
  res.status(200).json({ message: 'Logged out successfully' });
}

// ================================================
// GET PROFILE
// ================================================
async function getProfile(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, phone, avatar_url, role, created_at')
    .eq('id', user.id)
    .single();

  res.status(200).json({ user: profile });
}

// ================================================
// UPDATE PROFILE
// ================================================
async function updateProfile(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const allowed = ['full_name', 'phone', 'avatar_url'];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id, email, full_name, phone, avatar_url')
    .single();

  if (error) throw error;
  res.status(200).json({ user: data });
}

// ================================================
// GET ADDRESSES
// ================================================
async function getAddresses(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const { data, error } = await supabaseAdmin
    .from('addresses')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false });

  if (error) throw error;
  res.status(200).json({ addresses: data || [] });
}

// ================================================
// CREATE ADDRESS
// ================================================
async function createAddress(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const { full_name, phone, address_line1, city, state, country = 'Nigeria' } = req.body;
  validateFields(req.body, ['full_name', 'phone', 'address_line1', 'city', 'state']);

  // If this is the first address or set as default, unset others
  if (req.body.is_default) {
    await supabaseAdmin.from('addresses').update({ is_default: false }).eq('user_id', user.id);
  }

  const { data, error } = await supabaseAdmin
    .from('addresses')
    .insert({ ...req.body, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  res.status(201).json({ address: data });
}

// ================================================
// UPDATE ADDRESS
// ================================================
async function updateAddress(req, res, addressId) {
  const user = await authenticate(req, res);
  if (!user) return;

  if (req.body.is_default) {
    await supabaseAdmin.from('addresses').update({ is_default: false }).eq('user_id', user.id);
  }

  const { data, error } = await supabaseAdmin
    .from('addresses')
    .update(req.body)
    .eq('id', addressId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Address not found' });
  res.status(200).json({ address: data });
}

// ================================================
// DELETE ADDRESS
// ================================================
async function deleteAddress(req, res, addressId) {
  const user = await authenticate(req, res);
  if (!user) return;

  const { error } = await supabaseAdmin
    .from('addresses')
    .delete()
    .eq('id', addressId)
    .eq('user_id', user.id);

  if (error) throw error;
  res.status(200).json({ success: true });
}

// ================================================
// JWT HELPER
// ================================================
function generateToken(profile) {
  return jwt.sign(
    { sub: profile.id, email: profile.email, role: profile.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}
