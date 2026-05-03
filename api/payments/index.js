// ================================================
// backend/api/payments/index.js
// Payments — verify, webhooks for Paystack,
//             Flutterwave & PayPal
// ================================================

const { supabaseAdmin } = require('../../backend/config/supabase');
const { handler, requireAdmin } = require('../../backend/middleware');
const crypto = require('crypto');

module.exports = handler(async (req, res) => {
  const { method } = req;
  const parts = (req.url || '').replace(/\?.*/, '').split('/').filter(Boolean);
  const provider = parts[2]; // paystack | flutterwave | paypal | keys
  const action   = parts[3]; // verify | webhook | create | capture | config

  // GET /api/payments/keys — public keys for frontend
  if (method === 'GET' && provider === 'keys') return getPublicKeys(req, res);

  // GET /api/payments/paypal/config — PayPal client ID
  if (method === 'GET' && provider === 'paypal' && action === 'config') return getPayPalConfig(req, res);

  // POST /api/payments/paystack/verify
  if (method === 'POST' && provider === 'paystack' && action === 'verify') return verifyPaystack(req, res);

  // POST /api/payments/paystack/webhook
  if (method === 'POST' && provider === 'paystack' && action === 'webhook') return paystackWebhook(req, res);

  // POST /api/payments/flutterwave/verify
  if (method === 'POST' && provider === 'flutterwave' && action === 'verify') return verifyFlutterwave(req, res);

  // POST /api/payments/flutterwave/webhook
  if (method === 'POST' && provider === 'flutterwave' && action === 'webhook') return flutterwaveWebhook(req, res);

  // POST /api/payments/paypal/create
  if (method === 'POST' && provider === 'paypal' && action === 'create') return createPayPalOrder(req, res);

  // POST /api/payments/paypal/capture
  if (method === 'POST' && provider === 'paypal' && action === 'capture') return capturePayPalOrder(req, res);

  // POST /api/payments/paypal/webhook
  if (method === 'POST' && provider === 'paypal' && action === 'webhook') return paypalWebhook(req, res);

  // GET /api/payments/admin/summary — admin stats
  if (method === 'GET' && provider === 'admin' && action === 'summary') return adminSummary(req, res);

  res.status(404).json({ error: 'Not found' });
});

// ================================================
// PUBLIC KEYS
// ================================================
async function getPublicKeys(req, res) {
  res.status(200).json({
    paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || '',
    flutterwave_public_key: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
  });
}

async function getPayPalConfig(req, res) {
  res.status(200).json({
    client_id: process.env.PAYPAL_CLIENT_ID || '',
    mode: process.env.PAYPAL_MODE || 'sandbox',
  });
}

// ================================================
// MARK ORDER AS PAID
// ================================================
async function markOrderPaid(orderId, paymentReference, paymentMethod) {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .update({
      payment_status: 'paid',
      payment_reference: paymentReference,
      payment_method: paymentMethod,
      status: 'confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;

  // Add history entry
  await supabaseAdmin.from('order_status_history').insert({
    order_id: orderId,
    status: 'confirmed',
    note: `Payment confirmed via ${paymentMethod}. Ref: ${paymentReference}`,
  });

  return order;
}

// ================================================
// PAYSTACK VERIFY
// ================================================
async function verifyPaystack(req, res) {
  const { reference, order_id } = req.body;
  if (!reference || !order_id) return res.status(400).json({ error: 'reference and order_id required' });

  // Verify with Paystack API
  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });

  const data = await response.json();

  if (!response.ok || data.data?.status !== 'success') {
    return res.status(400).json({ error: 'Payment verification failed', details: data.message });
  }

  // Verify amount matches order
  const { data: order } = await supabaseAdmin.from('orders').select('total, currency').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const paidAmountNGN = data.data.amount / 100; // Paystack returns kobo
  if (Math.abs(paidAmountNGN - order.total) > 1) { // Allow 1 NGN tolerance for rounding
    return res.status(400).json({ error: 'Amount mismatch', expected: order.total, received: paidAmountNGN });
  }

  const updatedOrder = await markOrderPaid(order_id, reference, 'paystack');
  res.status(200).json({ success: true, order: updatedOrder });
}

// ================================================
// PAYSTACK WEBHOOK
// ================================================
async function paystackWebhook(req, res) {
  // Verify webhook signature
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const { event, data } = req.body;

  if (event === 'charge.success') {
    const orderId = data.metadata?.order_id;
    if (orderId) {
      await markOrderPaid(orderId, data.reference, 'paystack').catch(console.error);
    }
  }

  res.status(200).json({ received: true });
}

// ================================================
// FLUTTERWAVE VERIFY
// ================================================
async function verifyFlutterwave(req, res) {
  const { transaction_id, order_id } = req.body;
  if (!transaction_id || !order_id) return res.status(400).json({ error: 'transaction_id and order_id required' });

  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
    headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
  });

  const data = await response.json();

  if (!response.ok || data.data?.status !== 'successful') {
    return res.status(400).json({ error: 'Payment verification failed', details: data.message });
  }

  const { data: order } = await supabaseAdmin.from('orders').select('total, currency').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Flutterwave amount is in the currency unit (not kobo)
  if (Math.abs(data.data.amount - order.total) > 1) {
    return res.status(400).json({ error: 'Amount mismatch' });
  }

  const updatedOrder = await markOrderPaid(order_id, String(transaction_id), 'flutterwave');
  res.status(200).json({ success: true, order: updatedOrder });
}

// ================================================
// FLUTTERWAVE WEBHOOK
// ================================================
async function flutterwaveWebhook(req, res) {
  // Verify with secret hash
  const secretHash = process.env.FLUTTERWAVE_SECRET_KEY;
  const signature = req.headers['verif-hash'];

  if (signature !== secretHash) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const { event, data } = req.body;

  if (event === 'charge.completed' && data?.status === 'successful') {
    const orderId = data.meta?.order_id;
    if (orderId) {
      await markOrderPaid(orderId, String(data.id), 'flutterwave').catch(console.error);
    }
  }

  res.status(200).json({ received: true });
}

// ================================================
// PAYPAL CREATE ORDER
// ================================================
async function createPayPalOrder(req, res) {
  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'order_id required' });

  const { data: order } = await supabaseAdmin.from('orders').select('total, currency, order_number').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Get PayPal access token
  const accessToken = await getPayPalAccessToken();

  // Convert NGN to USD (simplified; in production use live exchange rate)
  const exchangeRate = 0.00065; // approximate NGN to USD
  const usdAmount = (order.total * exchangeRate).toFixed(2);

  const response = await fetch(`${getPayPalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.order_number,
        amount: { currency_code: 'USD', value: usdAmount },
        custom_id: order_id,
      }],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to create PayPal order');

  res.status(200).json({ paypal_order_id: data.id });
}

// ================================================
// PAYPAL CAPTURE ORDER
// ================================================
async function capturePayPalOrder(req, res) {
  const { paypal_order_id } = req.body;
  if (!paypal_order_id) return res.status(400).json({ error: 'paypal_order_id required' });

  const accessToken = await getPayPalAccessToken();

  const response = await fetch(`${getPayPalBase()}/v2/checkout/orders/${paypal_order_id}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  if (!response.ok || data.status !== 'COMPLETED') {
    return res.status(400).json({ error: 'PayPal capture failed', details: data });
  }

  const orderId = data.purchase_units?.[0]?.custom_id;
  if (!orderId) return res.status(400).json({ error: 'Could not find order reference' });

  const updatedOrder = await markOrderPaid(orderId, paypal_order_id, 'paypal');
  res.status(200).json({ success: true, order: updatedOrder, order_number: updatedOrder.order_number });
}

// ================================================
// PAYPAL WEBHOOK
// ================================================
async function paypalWebhook(req, res) {
  const eventType = req.body.event_type;

  if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
    const orderId = req.body.resource?.custom_id;
    const captureId = req.body.resource?.id;
    if (orderId && captureId) {
      await markOrderPaid(orderId, captureId, 'paypal').catch(console.error);
    }
  }

  res.status(200).json({ received: true });
}

// ================================================
// PAYPAL HELPERS
// ================================================
function getPayPalBase() {
  return process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch(`${getPayPalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Failed to get PayPal access token');
  return data.access_token;
}

// ================================================
// ADMIN PAYMENT SUMMARY
// ================================================
async function adminSummary(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { data: stats } = await supabaseAdmin.rpc('admin_dashboard_stats').single();

  // Revenue by payment method
  const { data: byMethod } = await supabaseAdmin
    .from('orders')
    .select('payment_method, total')
    .eq('payment_status', 'paid');

  const methodTotals = (byMethod || []).reduce((acc, o) => {
    acc[o.payment_method] = (acc[o.payment_method] || 0) + o.total;
    return acc;
  }, {});

  // Monthly revenue (last 6 months)
  const { data: monthly } = await supabaseAdmin.from('orders')
    .select('total, created_at')
    .eq('payment_status', 'paid')
    .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString());

  const monthlyRevenue = {};
  (monthly || []).forEach(o => {
    const month = new Date(o.created_at).toLocaleString('en', { month: 'short', year: '2-digit' });
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + o.total;
  });

  res.status(200).json({ stats, methodTotals, monthlyRevenue });
}
