-- ============================================
-- QUICK FIX: Create Missing User Profiles
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Create profiles for users missing profiles
INSERT INTO public.user_profiles (
  id, 
  email, 
  email_hash, 
  license_id, 
  role, 
  subscription_tier, 
  subscription_status, 
  subscription_start_date, 
  subscription_end_date,
  created_at,
  updated_at
)
SELECT 
  au.id,
  au.email,
  generate_email_hash(au.email),
  generate_unique_license_id(),
  'user',
  'free',
  'trial',
  COALESCE(au.created_at, NOW()),
  COALESCE(au.created_at, NOW()) + INTERVAL '14 days',
  COALESCE(au.created_at, NOW()),
  NOW()
FROM auth.users au
LEFT JOIN public.user_profiles up ON au.id = up.id
WHERE up.id IS NULL
  AND au.email IS NOT NULL
  AND au.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- Step 2: Fix any profiles missing license_id
UPDATE public.user_profiles
SET license_id = generate_unique_license_id()
WHERE license_id IS NULL 
   OR license_id = ''
   OR length(license_id) != 26
   OR license_id !~ '^[A-Za-z0-9]{25}=$';

-- Step 3: Verify the trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Step 4: Check results
SELECT 
  au.email,
  au.created_at,
  au.email_confirmed_at,
  up.license_id,
  up.role,
  up.subscription_tier,
  up.subscription_status
FROM auth.users au
LEFT JOIN public.user_profiles up ON au.id = up.id
ORDER BY au.created_at DESC;

