-- ================================================
-- ShopWave Seed Data
-- Run in Supabase SQL Editor (optional, for demo)
-- ================================================

-- Categories
INSERT INTO categories (id, name, slug, description, icon, sort_order) VALUES
  (uuid_generate_v4(), 'Electronics', 'electronics', 'Gadgets, devices and tech accessories', '💻', 1),
  (uuid_generate_v4(), 'Fashion', 'fashion', 'Clothing, shoes and accessories', '👗', 2),
  (uuid_generate_v4(), 'Home & Living', 'home-living', 'Furniture, decor and household items', '🏠', 3),
  (uuid_generate_v4(), 'Beauty', 'beauty', 'Skincare, makeup and personal care', '✨', 4),
  (uuid_generate_v4(), 'Sports', 'sports', 'Fitness, outdoor and sports equipment', '⚽', 5),
  (uuid_generate_v4(), 'Books & Digital', 'books-digital', 'Books, courses and digital downloads', '📚', 6),
  (uuid_generate_v4(), 'Food & Grocery', 'food-grocery', 'Fresh produce and packaged goods', '🛒', 7),
  (uuid_generate_v4(), 'Kids & Babies', 'kids-babies', 'Toys, clothes and accessories for children', '🧸', 8);

-- Sample Products (Electronics)
WITH elec AS (SELECT id FROM categories WHERE slug = 'electronics' LIMIT 1)
INSERT INTO products (name, slug, short_description, description, price, compare_price, currency, stock_quantity, is_featured, category_id, tags, product_type, sku)
SELECT
  'Wireless Noise-Cancelling Headphones',
  'wireless-nc-headphones-pro',
  'Premium sound quality with 30-hour battery life',
  'Experience music like never before with our premium wireless headphones. Features active noise cancellation, 30-hour battery life, and premium audio drivers for studio-quality sound.',
  89900, 129900, 'NGN', 50, TRUE, elec.id,
  ARRAY['headphones', 'wireless', 'audio', 'electronics'], 'physical', 'ELEC-HP-001'
FROM elec;

WITH elec AS (SELECT id FROM categories WHERE slug = 'electronics' LIMIT 1)
INSERT INTO products (name, slug, short_description, description, price, compare_price, currency, stock_quantity, is_featured, category_id, tags, product_type, sku)
SELECT
  'Smart Watch Series X',
  'smart-watch-series-x',
  'Track fitness, notifications and more from your wrist',
  'Stay connected and healthy with our smartwatch. Monitor heart rate, sleep, and fitness goals. Compatible with iOS and Android.',
  45000, 60000, 'NGN', 30, TRUE, elec.id,
  ARRAY['smartwatch', 'fitness', 'wearable'], 'physical', 'ELEC-SW-001'
FROM elec;

-- Sample Products (Digital)
WITH books AS (SELECT id FROM categories WHERE slug = 'books-digital' LIMIT 1)
INSERT INTO products (name, slug, short_description, description, price, compare_price, currency, stock_quantity, is_featured, category_id, tags, product_type, sku, digital_file_url, download_limit)
SELECT
  'Complete Web Development Course 2024',
  'complete-web-dev-course-2024',
  'Master HTML, CSS, JS, and backend development',
  'A comprehensive course covering everything from HTML basics to advanced full-stack development. 40+ hours of video content, projects, and certificate of completion.',
  15000, 25000, 'NGN', 9999, TRUE, books.id,
  ARRAY['course', 'programming', 'web development', 'digital'], 'digital', 'DIG-WD-001',
  'https://your-storage.supabase.co/storage/v1/object/sign/courses/web-dev-2024.zip', 3
FROM books;

-- Add primary images for demo products
INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600', 'Wireless headphones', TRUE, 0
FROM products p WHERE p.slug = 'wireless-nc-headphones-pro';

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600', 'Smart Watch', TRUE, 0
FROM products p WHERE p.slug = 'smart-watch-series-x';

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600', 'Web Dev Course', TRUE, 0
FROM products p WHERE p.slug = 'complete-web-dev-course-2024';

-- Sample coupon
INSERT INTO coupons (code, type, value, min_order_amount, max_uses, is_active)
VALUES ('WELCOME10', 'percentage', 10, 5000, 1000, TRUE);
