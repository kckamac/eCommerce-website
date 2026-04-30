# ShopWave — Modern eCommerce Platform

A full-stack, lightweight eCommerce platform built with pure HTML/CSS/JS (frontend) and Node.js + PostgreSQL via Supabase (backend). Deployed on Vercel + Supabase.

---

## 🗂 Project Structure

```
shopwave/
├── frontend/
│   ├── pages/              # All HTML pages
│   ├── css/                # Stylesheets
│   ├── js/                 # Vanilla JS modules
│   └── assets/             # Icons, images
├── backend/
│   ├── api/                # REST API route handlers
│   │   ├── products/
│   │   ├── orders/
│   │   ├── users/
│   │   ├── payments/
│   │   └── admin/
│   ├── middleware/         # Auth, CORS, rate-limiting
│   ├── config/             # DB, payment configs
│   └── utils/              # Helpers
├── supabase/
│   ├── migrations/         # SQL schema files
│   └── seed/               # Seed data
├── docs/                   # Additional documentation
├── vercel.json             # Vercel deployment config
├── package.json
└── README.md
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Pure HTML5, CSS3, Vanilla JS (ES Modules) |
| Backend | Node.js (Vercel Serverless Functions) |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth (JWT) |
| Storage | Supabase Storage (product images) |
| Payments | Paystack, Flutterwave, PayPal |
| Hosting | Vercel (frontend + API) + Supabase (DB + Auth) |

---

## 🚀 Local Setup

### Prerequisites
- Node.js v18+
- A Supabase account (free tier works)
- Paystack, Flutterwave, and PayPal developer accounts

### 1. Clone / Extract the project
```bash
cd shopwave
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local` and fill in your keys:
```bash
cp .env.example .env.local
```

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Payments
PAYSTACK_SECRET_KEY=sk_test_xxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxx
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxxx
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-xxxx
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PAYPAL_MODE=sandbox   # or 'live'

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
JWT_SECRET=your-jwt-secret-32chars+
```

### 3. Set up Supabase Database
1. Create a new project at https://supabase.com
2. Go to **SQL Editor** in your Supabase dashboard
3. Run the migration files **in order**:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_functions.sql`
4. (Optional) Run seed data: `supabase/seed/seed_products.sql`

### 4. Run locally
```bash
npm run dev
```
Open http://localhost:3000

---

## ☁️ Deploying to Vercel + Supabase

### Supabase (Database)
1. Create project at https://supabase.com/dashboard
2. Run all migration SQL files in SQL Editor
3. Enable Row Level Security (already in migration files)
4. Copy your **Project URL** and **anon key** from Settings → API

### Vercel (Frontend + API)
1. Push your project to GitHub
2. Go to https://vercel.com/new → Import your repo
3. Add all environment variables from `.env.example` in Vercel dashboard (Settings → Environment Variables)
4. Deploy — Vercel auto-detects `vercel.json` config

### Custom Domain (Optional)
In Vercel dashboard → Settings → Domains → Add your domain.

---

## 💳 Payment Setup

### Paystack
- Sign up at https://paystack.com
- Get test keys from Dashboard → Settings → API Keys
- Add webhook URL: `https://yourdomain.com/api/payments/paystack/webhook`

### Flutterwave
- Sign up at https://flutterwave.com
- Get test keys from Dashboard → Settings → API
- Add webhook URL: `https://yourdomain.com/api/payments/flutterwave/webhook`

### PayPal
- Create app at https://developer.paypal.com
- Get Client ID & Secret from My Apps & Credentials
- Add webhook URL: `https://yourdomain.com/api/payments/paypal/webhook`

---

## 📄 Pages

| Page | URL |
|------|-----|
| Home | `/` |
| Shop / Category | `/pages/shop.html` |
| Product Detail | `/pages/product.html` |
| Cart | `/pages/cart.html` |
| Checkout | `/pages/checkout.html` |
| Order Confirmation | `/pages/order-confirm.html` |
| User Account | `/pages/account.html` |
| Orders History | `/pages/orders.html` |
| Login / Register | `/pages/auth.html` |
| Admin Dashboard | `/pages/admin/dashboard.html` |
| Admin Products | `/pages/admin/products.html` |
| Admin Orders | `/pages/admin/orders.html` |
| Admin Customers | `/pages/admin/customers.html` |

---

## 🎨 Brand Colors

| Token | Value | Use |
|-------|-------|-----|
| `--brand-primary` | `#FF6B35` | CTAs, highlights |
| `--brand-secondary` | `#2EC4B6` | Accents, badges |
| `--brand-dark` | `#1A1A2E` | Text, nav |
| `--brand-light` | `#FFF8F3` | Backgrounds |
| `--brand-gold` | `#FFB347` | Stars, premium |

---

## 📦 Features

- ✅ Product listing with category filtering
- ✅ Full-text search with live results
- ✅ "People also bought" recommendations
- ✅ Digital & Physical product support
- ✅ Paystack, Flutterwave, PayPal checkout
- ✅ User registration, login, profile
- ✅ Order tracking
- ✅ Admin: product CRUD with image upload
- ✅ Admin: order management
- ✅ Admin: customer management
- ✅ Inventory tracking (stock management)
- ✅ Supabase Auth + JWT
- ✅ Row Level Security
- ✅ 100/100 Lighthouse target (minimal JS, no frameworks)
- ✅ SEO meta tags on all pages
- ✅ Responsive mobile-first design
