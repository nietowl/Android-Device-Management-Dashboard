-- ============================================
-- SIMPLE SQL TO CREATE USER PROFILE
-- Run this AFTER creating the auth user via Dashboard or API
-- ============================================
-- 
-- STEP 1: Create auth user with password (NOT SQL - use Dashboard or API)
--   - Go to Supabase Dashboard > Authentication > Users > Add User
--   - OR use Admin API to create user with password
--
-- STEP 2: Run this SQL to create the profile
--   Replace 'YOUR_USER_UUID_HERE' and 'user@example.com' with actual values
-- ============================================

-- Option A: Create profile by UUID (if you know the user's UUID)
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
  max_devices,
  is_active,
  created_at,
  updated_at
)
VALUES (
  'YOUR_USER_UUID_HERE'::UUID,  -- Replace with actual UUID from auth.users
  'user@example.com',            -- Replace with actual email
  generate_email_hash('user@example.com'),
  generate_unique_license_id(),
  'user',                        -- or 'admin' for admin account
  'free',                        -- or 'basic', 'premium', 'enterprise'
  'trial',                       -- or 'active', 'expired', 'cancelled'
  NOW(),
  NOW() + INTERVAL '14 days',
  1,                             -- max devices
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  email_hash = EXCLUDED.email_hash,
  updated_at = NOW();

-- Option B: Create profile by email (finds user automatically)
DO $$
DECLARE
  target_email TEXT := 'user@example.com';  -- Replace with actual email
  found_user_id UUID;
BEGIN
  -- Find user by email
  SELECT id INTO found_user_id
  FROM auth.users
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(target_email))
    AND deleted_at IS NULL
  LIMIT 1;
  
  IF found_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % does not exist. Create auth user first via Dashboard!', target_email;
  END IF;

  -- Create profile
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
    max_devices,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    found_user_id,
    target_email,
    generate_email_hash(target_email),
    generate_unique_license_id(),
    'user',
    'free',
    'trial',
    NOW(),
    NOW() + INTERVAL '14 days',
    1,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    email_hash = EXCLUDED.email_hash,
    updated_at = NOW();
  
  RAISE NOTICE 'Profile created for email % with user_id %', target_email, found_user_id;
END $$;

-- ============================================
-- VERIFY THE PROFILE WAS CREATED
-- ============================================
-- Uncomment and run to check:
-- SELECT 
--   up.id,
--   up.email,
--   up.role,
--   up.license_id,
--   up.created_at
-- FROM public.user_profiles up
-- WHERE up.email = 'user@example.com';

