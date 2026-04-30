-- ================================================
-- ShopWave SQL Functions & Views
-- Migration: 003_functions.sql
-- Run AFTER 002_rls_policies.sql
-- ================================================

-- ================================================
-- Full-text product search function
-- ================================================
CREATE OR REPLACE FUNCTION search_products(
  search_query TEXT,
  category_slug TEXT DEFAULT NULL,
  min_price NUMERIC DEFAULT NULL,
  max_price NUMERIC DEFAULT NULL,
  sort_by TEXT DEFAULT 'relevance',
  page_num INT DEFAULT 1,
  page_size INT DEFAULT 20
)
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, short_description TEXT,
  price NUMERIC, compare_price NUMERIC, currency TEXT,
  stock_status TEXT, product_type TEXT, rating_avg NUMERIC,
  rating_count INT, sale_count INT, view_count INT,
  is_featured BOOLEAN, category_name TEXT, primary_image TEXT,
  total_count BIGINT
) AS $$
DECLARE
  offset_val INT := (page_num - 1) * page_size;
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT p.*,
      c.name AS cat_name,
      pi.image_url AS img,
      COUNT(*) OVER() AS total
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
    WHERE p.is_active = TRUE
      AND (search_query IS NULL OR search_query = '' OR
           to_tsvector('english', p.name || ' ' || COALESCE(p.description, '') || ' ' || COALESCE(p.short_description, ''))
           @@ plainto_tsquery('english', search_query))
      AND (category_slug IS NULL OR c.slug = category_slug)
      AND (min_price IS NULL OR p.price >= min_price)
      AND (max_price IS NULL OR p.price <= max_price)
  )
  SELECT
    f.id, f.name, f.slug, f.short_description,
    f.price, f.compare_price, f.currency,
    f.stock_status, f.product_type, f.rating_avg,
    f.rating_count, f.sale_count, f.view_count,
    f.is_featured, f.cat_name, f.img, f.total
  FROM filtered f
  ORDER BY
    CASE WHEN sort_by = 'relevance' AND search_query IS NOT NULL THEN
      ts_rank(to_tsvector('english', f.name || ' ' || COALESCE(f.description, '')),
              plainto_tsquery('english', search_query))
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'newest' THEN f.created_at END DESC,
    CASE WHEN sort_by = 'price_asc' THEN f.price END ASC,
    CASE WHEN sort_by = 'price_desc' THEN f.price END DESC,
    CASE WHEN sort_by = 'popular' THEN f.sale_count END DESC,
    CASE WHEN sort_by = 'rating' THEN f.rating_avg END DESC,
    f.is_featured DESC, f.created_at DESC
  LIMIT page_size OFFSET offset_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- Get product recommendations (people also bought)
-- ================================================
CREATE OR REPLACE FUNCTION get_recommendations(
  p_product_id UUID,
  result_limit INT DEFAULT 8
)
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, price NUMERIC,
  compare_price NUMERIC, rating_avg NUMERIC,
  stock_status TEXT, primary_image TEXT, score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.slug, p.price, p.compare_price,
    p.rating_avg, p.stock_status,
    pi.image_url AS primary_image,
    pr.score
  FROM product_recommendations pr
  JOIN products p ON p.id = pr.recommended_product_id
  LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
  WHERE pr.product_id = p_product_id
    AND p.is_active = TRUE
    AND p.stock_status != 'discontinued'
  ORDER BY pr.score DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- Rebuild recommendations matrix
-- (Run periodically via Supabase Edge Function cron)
-- ================================================
CREATE OR REPLACE FUNCTION rebuild_recommendations()
RETURNS void AS $$
BEGIN
  -- Clear existing
  DELETE FROM product_recommendations;

  -- Insert co-purchased products (from completed orders)
  INSERT INTO product_recommendations (product_id, recommended_product_id, score)
  SELECT
    a.product_id,
    b.product_id AS recommended_product_id,
    COUNT(*)::NUMERIC AS score
  FROM order_items a
  JOIN order_items b ON a.order_id = b.order_id AND a.product_id != b.product_id
  JOIN orders o ON o.id = a.order_id AND o.payment_status = 'paid'
  GROUP BY a.product_id, b.product_id
  HAVING COUNT(*) >= 1

  UNION ALL

  -- Co-viewed products
  SELECT
    a.product_id,
    b.product_id,
    COUNT(*)::NUMERIC * 0.3 -- Lower weight than purchases
  FROM product_views a
  JOIN product_views b ON a.session_id = b.session_id AND a.product_id != b.product_id
    AND a.viewed_at BETWEEN b.viewed_at - INTERVAL '30 minutes' AND b.viewed_at + INTERVAL '30 minutes'
  GROUP BY a.product_id, b.product_id

  ON CONFLICT (product_id, recommended_product_id)
  DO UPDATE SET score = EXCLUDED.score + product_recommendations.score, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- Admin dashboard summary view
-- ================================================
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '30 days') AS orders_this_month,
  (SELECT COALESCE(SUM(total), 0) FROM orders WHERE payment_status = 'paid' AND created_at >= NOW() - INTERVAL '30 days') AS revenue_this_month,
  (SELECT COUNT(*) FROM profiles WHERE role = 'customer') AS total_customers,
  (SELECT COUNT(*) FROM products WHERE is_active = TRUE) AS total_products,
  (SELECT COUNT(*) FROM products WHERE stock_status = 'out_of_stock' AND is_active = TRUE) AS out_of_stock_count,
  (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
  (SELECT COUNT(*) FROM reviews WHERE is_approved = FALSE) AS pending_reviews;

-- Grant access to admin view
GRANT SELECT ON admin_dashboard_stats TO authenticated;

-- ================================================
-- Validate and apply coupon
-- ================================================
CREATE OR REPLACE FUNCTION apply_coupon(
  coupon_code_input TEXT,
  order_subtotal NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  coupon RECORD;
  discount NUMERIC;
BEGIN
  SELECT * INTO coupon FROM coupons
  WHERE code = UPPER(coupon_code_input)
    AND is_active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses IS NULL OR used_count < max_uses);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid or expired coupon code');
  END IF;

  IF order_subtotal < coupon.min_order_amount THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Minimum order amount of ' || coupon.min_order_amount || ' required'
    );
  END IF;

  IF coupon.type = 'percentage' THEN
    discount := ROUND((order_subtotal * coupon.value / 100), 2);
  ELSE
    discount := LEAST(coupon.value, order_subtotal);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', coupon.id,
    'code', coupon.code,
    'type', coupon.type,
    'value', coupon.value,
    'discount', discount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- Seed default admin user (update email/password via Supabase Auth UI)
-- ================================================
-- NOTE: Create the admin user through Supabase Auth dashboard first,
-- then run this to set their role:
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@yourshop.com';
