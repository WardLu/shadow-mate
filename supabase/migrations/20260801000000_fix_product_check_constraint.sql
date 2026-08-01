-- Fix: update learning_households product check to shadow-mate.
-- The table may have been created before the rebrand with a different product id.
-- CREATE TABLE IF NOT EXISTS does not update constraints on existing tables.
ALTER TABLE public.learning_households DROP CONSTRAINT IF EXISTS learning_households_product_check;
ALTER TABLE public.learning_households ADD CONSTRAINT learning_households_product_check
  CHECK (project_id = 'shadow-mate');
ALTER TABLE public.learning_households ALTER COLUMN project_id SET DEFAULT 'shadow-mate';
UPDATE public.learning_households SET project_id = 'shadow-mate' WHERE project_id <> 'shadow-mate';