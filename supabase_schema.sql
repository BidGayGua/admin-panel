-- =============================================
-- СКРИПТ СОЗДАНИЯ БАЗЫ ДАННЫХ
-- Запустить в Supabase Dashboard → SQL Editor
-- =============================================

-- 1. ЗАКАЗЫ (единая таблица для всех направлений)
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_number INTEGER,
  date DATE,
  client TEXT NOT NULL,
  phone TEXT,
  description TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('tipografia','promotion','repair')),
  
  -- Финансы
  unit_price NUMERIC(12,2) DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  total_amount NUMERIC(12,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('paid','unpaid','partial')),
  payment_method TEXT,
  profit NUMERIC(12,2) DEFAULT 0,
  
  -- Статус заказа
  status TEXT DEFAULT 'incoming' CHECK (status IN ('incoming','inprogress','done','completed','cancelled')),
  completion_date DATE,
  completion_status TEXT,
  delay_reason TEXT,
  
  -- Типография
  city TEXT,
  design_cost NUMERIC(10,2),
  material_cost NUMERIC(10,2),
  delivery_cost NUMERIC(10,2),
  return_status TEXT,
  
  -- Промоушен
  sector TEXT,
  promoter_name TEXT,
  promoter_payment NUMERIC(10,2),
  region TEXT,
  
  -- Ремонт
  cartridge_model TEXT,
  printer_model TEXT,
  work_type TEXT,
  toner_model TEXT,
  purchase_price NUMERIC(10,2),
  
  -- Мета
  source TEXT DEFAULT 'manual',
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ШАБЛОНЫ
CREATE TABLE IF NOT EXISTS templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('tipografia','promotion','repair')),
  amount NUMERIC(12,2) DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  unit_price NUMERIC(12,2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. МАТЕРИАЛЫ (склад)
CREATE TABLE IF NOT EXISTS materials (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('tipografia','promotion','repair')),
  unit TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 0,
  min_level NUMERIC(10,2) DEFAULT 0,
  purchase_price NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. КЛИЕНТЫ
CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  city TEXT DEFAULT 'Астана',
  total_orders INTEGER DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  debt NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ИСТОРИЯ ДЕЙСТВИЙ
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('create','edit','delete','restore')),
  subject TEXT NOT NULL,
  detail TEXT,
  order_id BIGINT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ИНДЕКСЫ ДЛЯ БЫСТРОГО ПОИСКА
-- =============================================
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_direction ON orders(direction);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);

-- =============================================
-- АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- ДЕМО-ШАБЛОНЫ
-- =============================================
INSERT INTO templates (name, direction, amount, unit_cost, unit_price, description) VALUES
  ('Визитки 1000 шт', 'tipografia', 18000, 12, 25, 'Цветные визитки, бумага 300-350 г/м², ламинация'),
  ('Баннер 2x3', 'promotion', 60000, 600, 1500, 'Баннер 2x3 м с люверсами'),
  ('Заправка картриджа', 'repair', 5000, 800, 2000, 'Заправка + чистка + тест-лист'),
  ('Листовки А4 1000 шт', 'tipografia', 25000, 8, 18, 'Полноцвет, бумага 150 г/м²'),
  ('Брендирование авто', 'promotion', 150000, 5000, 12000, 'Плёнка Oracal 3-5 элементов')
ON CONFLICT DO NOTHING;

-- =============================================
-- ДЕМО-МАТЕРИАЛЫ
-- =============================================
INSERT INTO materials (name, direction, unit, quantity, min_level, purchase_price) VALUES
  ('Бумага А4 80г/м² "Снегурочка"', 'tipografia', 'пачка', 50, 10, 2500),
  ('Бумага А3 160г/м² матовая', 'tipografia', 'пачка', 12, 15, 4200),
  ('Тонер HP LJ 1102 (чёрный)', 'repair', 'шт', 12, 5, 1800),
  ('Тонер Canon 2900 (чёрный)', 'repair', 'шт', 3, 8, 1500),
  ('Плёнка самоклеящаяся белая матовая', 'promotion', 'м²', 25, 10, 1200),
  ('Картридж Epson L3150 (CMYK)', 'repair', 'компл.', 8, 10, 3800),
  ('Баннерная ткань 440 г/м²', 'promotion', 'м²', 60, 20, 950),
  ('Ламинация А4 матовая', 'tipografia', 'листов', 200, 50, 80)
ON CONFLICT DO NOTHING;
