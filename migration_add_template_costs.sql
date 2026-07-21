-- =============================================
-- МИГРАЦИЯ: Добавление unit_cost / unit_price в templates
-- Запустить в Supabase Dashboard → SQL Editor
-- =============================================

-- 1. Добавляем колонки (IF NOT EXISTS — идемпотентно)
ALTER TABLE IF EXISTS templates
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0;

-- 2. Переносим существующие значения amount → unit_price (для старых шаблонов)
UPDATE templates SET unit_price = amount WHERE unit_price = 0 AND amount > 0;

-- 3. Обновляем демо-шаблоны с реальными unit_cost / unit_price
INSERT INTO templates (name, direction, unit_cost, unit_price, amount, description) VALUES
  ('Визитки 1 шт', 'tipografia', 12, 25, 25, 'Цветная визитка 300-350 г/м², ламинация'),
  ('Баннер 1 м²', 'promotion', 600, 1500, 1500, 'Баннерная ткань с люверсами за 1 м²'),
  ('Заправка картриджа', 'repair', 800, 2000, 2000, 'Заправка + чистка + тест-лист'),
  ('Листовка А4 1 шт', 'tipografia', 8, 18, 18, 'Полноцвет, бумага 150 г/м²'),
  ('Брендирование авто 1 элемент', 'promotion', 5000, 12000, 12000, 'Плёнка Oracal, 1 элемент')
ON CONFLICT (id) DO UPDATE SET
  unit_cost = EXCLUDED.unit_cost,
  unit_price = EXCLUDED.unit_price,
  amount = EXCLUDED.amount;
