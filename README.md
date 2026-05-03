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

🔐 How to Access the Admin Dashboard
Step 1 — Create Your Admin User Account
First, create a regular account on your site the normal way:

Go to yoursite.com/pages/auth.html
Click Create Account and register with your email and password
You'll be logged in as a regular customer by default


Step 2 — Promote the User to Admin in Supabase

Go to your Supabase Dashboard → supabase.com/dashboard
Select your ShopWave project
Click SQL Editor in the left sidebar
Run this query (replace the email):

sql:
UPDATE profiles
SET role = 'admin'
WHERE email = 'your@email.com';

For a Super Admin (who can also manage other admins):
sql:
UPDATE profiles
SET role = 'super_admin'
WHERE email = 'your@email.com';

Click Run — you'll see 1 row affected


Step 3 — Log In to the Admin Dashboard

Sign out and sign back in at yoursite.com/pages/auth.html
Navigate directly to: yoursite.com/pages/admin/dashboard.html
If your role is admin or super_admin, you'll see the full dashboard. Anyone else gets redirected to the homepage automatically.


👥 Adding Multiple Staff / Managers
You can assign different roles to different team members the same way. Here's a summary of each role:
RoleWhat They Can DocustomerShop, place orders, manage their own profileadminFull access — products, orders, customers, settings, couponssuper_adminEverything an admin can do, plus change other users' roles

To add a second admin (e.g. a store manager):
sql:
UPDATE profiles
SET role = 'admin'
WHERE email = 'manager@yourcompany.com';

To downgrade someone back to customer:
sql:
UPDATE profiles
SET role = 'customer'
WHERE email = 'former-staff@email.com';

🔒 To Disable a Staff Account
If someone leaves and you need to lock them out immediately:
sql:
UPDATE profiles
SET is_active = FALSE
WHERE email = 'ex-staff@email.com';

They'll get a "Your account has been disabled" error on their next login attempt.

💡 Pro Tips
View all admins at any time:
sql:
SELECT email, full_name, role, is_active, created_at
FROM profiles
WHERE role IN ('admin', 'super_admin')
ORDER BY created_at;

View all users:
sql:
SELECT email, full_name, role, is_active, created_at
FROM profiles
ORDER BY created_at DESC;

From the Admin UI itself — once you're logged in as super_admin, you can also enable/disable customer accounts from the Customers page (/pages/admin/customers.html) without touching SQL.

The admin dashboard URL is intentionally not linked from the public storefront — only people who know the path and have the right role in the database can access it. For extra security in production, you could also add your admin path to a password-protected Vercel deployment or restrict it by IP.