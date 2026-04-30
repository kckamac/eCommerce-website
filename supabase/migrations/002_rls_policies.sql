-- ================================================
-- ShopWave Row Level Security (RLS) Policies
-- Migration: 002_rls_policies.sql
-- Run AFTER 001_schema.sql
-- ================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ================================================
-- PROFILES
-- ================================================
CREATE POLICY "Public: view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admin: view all profiles" ON profiles
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "User: update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin: update any profile" ON profiles
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "System: insert profile on signup" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ================================================
-- ADDRESSES
-- ================================================
CREATE POLICY "User: manage own addresses" ON addresses
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admin: view all addresses" ON addresses
  FOR SELECT USING (is_admin(auth.uid()));

-- ================================================
-- CATEGORIES (public read)
-- ================================================
CREATE POLICY "Public: read active categories" ON categories
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Admin: manage categories" ON categories
  FOR ALL USING (is_admin(auth.uid()));

-- ================================================
-- PRODUCTS (public read for active products)
-- ================================================
CREATE POLICY "Public: read active products" ON products
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Admin: manage all products" ON products
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Public: read product images" ON product_images
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM products WHERE id = product_id AND is_active = TRUE)
  );

CREATE POLICY "Admin: manage product images" ON product_images
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Public: read product variants" ON product_variants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM products WHERE id = product_id AND is_active = TRUE)
  );

CREATE POLICY "Admin: manage product variants" ON product_variants
  FOR ALL USING (is_admin(auth.uid()));

-- ================================================
-- REVIEWS
-- ================================================
CREATE POLICY "Public: read approved reviews" ON reviews
  FOR SELECT USING (is_approved = TRUE);

CREATE POLICY "User: create own review" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User: update own review" ON reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admin: manage reviews" ON reviews
  FOR ALL USING (is_admin(auth.uid()));

-- ================================================
-- WISHLISTS
-- ================================================
CREATE POLICY "User: manage own wishlist" ON wishlists
  FOR ALL USING (auth.uid() = user_id);

-- ================================================
-- CARTS
-- ================================================
CREATE POLICY "User: manage own cart" ON carts
  FOR ALL USING (auth.uid() = user_id OR session_id IS NOT NULL);

CREATE POLICY "User: manage own cart items" ON cart_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM carts WHERE id = cart_id AND (user_id = auth.uid() OR session_id IS NOT NULL))
  );

-- ================================================
-- ORDERS
-- ================================================
CREATE POLICY "User: view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "User: create order" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admin: manage all orders" ON orders
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "User: view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE id = order_id AND user_id = auth.uid())
  );

CREATE POLICY "Admin: manage order items" ON order_items
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "User: view own order history" ON order_status_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE id = order_id AND user_id = auth.uid())
  );

CREATE POLICY "Admin: manage order history" ON order_status_history
  FOR ALL USING (is_admin(auth.uid()));

-- ================================================
-- PRODUCT VIEWS & RECOMMENDATIONS
-- ================================================
CREATE POLICY "Anyone: insert product view" ON product_views
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Public: read recommendations" ON product_recommendations
  FOR SELECT USING (TRUE);

CREATE POLICY "Admin: manage recommendations" ON product_recommendations
  FOR ALL USING (is_admin(auth.uid()));

-- ================================================
-- SETTINGS (admin only write, public read)
-- ================================================
CREATE POLICY "Public: read settings" ON settings
  FOR SELECT USING (TRUE);

CREATE POLICY "Admin: manage settings" ON settings
  FOR ALL USING (is_admin(auth.uid()));

-- ================================================
-- COUPONS
-- ================================================
CREATE POLICY "Admin: manage coupons" ON coupons
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Anyone: read active coupons" ON coupons
  FOR SELECT USING (is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()));
