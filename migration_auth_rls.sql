-- =============================================
-- МИГРАЦИЯ: Supabase Auth + Row Level Security
-- Запустить ПОСЛЕ создания первого пользователя
-- =============================================

-- 1. Включаем RLS на всех таблицах
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;

-- 2. Политики для admin — полный доступ
CREATE POLICY IF NOT EXISTS "admin_all_orders" ON orders
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "admin_all_templates" ON templates
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "admin_all_materials" ON materials
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "admin_all_clients" ON clients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "admin_all_audit_log" ON audit_log
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 3. Функция: кто текущий пользователь
CREATE OR REPLACE FUNCTION auth.user_email()
RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', 'unknown@user');
$$;
