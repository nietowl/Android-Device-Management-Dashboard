-- ============================================
-- MANUAL ACCOUNT CREATION IN SUPABASE
-- Android Device Management Dashboard
-- ============================================
-- 
-- ⚠️ READ THIS FIRST ⚠️
-- This file contains ONLY SQL code (executable) and documentation (comments).
-- JavaScript examples at the bottom are DOCUMENTATION ONLY - do NOT run them in SQL editor!
-- 
-- ⚠️ WHERE IS THE PASSWORD FIELD? ⚠️
-- Passwords are NOT in public.user_profiles - they're in auth.users table!
-- 
-- Account creation requires TWO steps:
--   1. Create auth user (with password) → stored in auth.users table
--   2. Create profile (this SQL script) → stored in public.user_profiles table
--
-- IMPORTANT NOTES:
-- 1. You CANNOT directly insert into auth.users via SQL for security reasons
-- 2. Passwords are hashed and stored in auth.users.encrypted_password (not accessible via SQL)
-- 3. You must use Supabase Admin API or Dashboard to create auth users WITH passwords
-- 4. This script provides SQL to create the profile AFTER the auth user exists
--
-- RECOMMENDED APPROACH:
-- Step 1: Create auth user with password via Dashboard or Admin API (see bottom of file)
-- Step 2: Run one of the SQL options below to create the profile
--
-- QUICK START: See create-account-simple.sql for a simpler version
-- ============================================

-- ============================================
-- OPTION 1: Create Profile for Existing Auth User
-- ============================================
-- Use this if you already have a user in auth.users (created via Dashboard or API)
-- Replace the UUID and email with your actual values

-- Example: Create profile for user with specific UUID
DO $$
DECLARE
  target_user_id UUID := 'YOUR_USER_UUID_HERE';  -- Replace with actual UUID
  target_email TEXT := 'user@example.com';       -- Replace with actual email
  email_hash_value TEXT;
  license_id_value TEXT;
BEGIN
  -- Check if user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User with ID % does not exist in auth.users. Please create the auth user first via Supabase Dashboard or Admin API.', target_user_id;
  END IF;

  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = target_user_id) THEN
    RAISE NOTICE 'Profile already exists for user %. Updating instead of creating.', target_user_id;
    
    -- Update existing profile
    UPDATE public.user_profiles
    SET 
      email = target_email,
      email_hash = generate_email_hash(target_email),
      license_id = CASE
        WHEN license_id IS NULL 
             OR license_id = ''
             OR length(license_id) != 26
             OR license_id !~ '^[A-Za-z0-9]{25}=$'
        THEN generate_unique_license_id()
        ELSE license_id
      END,
      updated_at = NOW()
    WHERE id = target_user_id;
    
    RAISE NOTICE 'Profile updated successfully for user %', target_user_id;
  ELSE
    -- Generate email hash
    email_hash_value := generate_email_hash(target_email);
    
    -- Generate unique license ID
    license_id_value := generate_unique_license_id();
    
    -- Insert new profile
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
      target_user_id,
      target_email,
      email_hash_value,
      license_id_value,
      'user',              -- Default role: 'user' or 'admin'
      'free',              -- Default tier: 'free', 'basic', 'premium', 'enterprise'
      'trial',             -- Default status: 'trial', 'active', 'expired', 'cancelled'
      NOW(),               -- Subscription start date
      NOW() + INTERVAL '14 days',  -- 14-day trial period
      1,                   -- Max devices
      true,                -- Is active
      NOW(),
      NOW()
    );
    
    RAISE NOTICE 'Profile created successfully for user % with license_id %', target_user_id, license_id_value;
  END IF;
END $$;

-- ============================================
-- OPTION 2: Create Profile by Email (if auth user exists)
-- ============================================
-- This finds the auth user by email and creates the profile

DO $$
DECLARE
  target_email TEXT := 'user@example.com';  -- Replace with actual email
  found_user_id UUID;
  email_hash_value TEXT;
  license_id_value TEXT;
BEGIN
  -- Find user by email
  SELECT id INTO found_user_id
  FROM auth.users
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(target_email))
    AND deleted_at IS NULL
  LIMIT 1;
  
  IF found_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % does not exist in auth.users. Please create the auth user first via Supabase Dashboard or Admin API.', target_email;
  END IF;

  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = found_user_id) THEN
    RAISE NOTICE 'Profile already exists for email %. Updating instead of creating.', target_email;
    
    UPDATE public.user_profiles
    SET 
      email = target_email,
      email_hash = generate_email_hash(target_email),
      license_id = CASE
        WHEN license_id IS NULL 
             OR license_id = ''
             OR length(license_id) != 26
             OR license_id !~ '^[A-Za-z0-9]{25}=$'
        THEN generate_unique_license_id()
        ELSE license_id
      END,
      updated_at = NOW()
    WHERE id = found_user_id;
    
    RAISE NOTICE 'Profile updated successfully for email %', target_email;
  ELSE
    -- Generate values
    email_hash_value := generate_email_hash(target_email);
    license_id_value := generate_unique_license_id();
    
    -- Insert profile
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
      email_hash_value,
      license_id_value,
      'user',
      'free',
      'trial',
      NOW(),
      NOW() + INTERVAL '14 days',
      1,
      true,
      NOW(),
      NOW()
    );
    
    RAISE NOTICE 'Profile created successfully for email % with user_id % and license_id %', 
      target_email, found_user_id, license_id_value;
  END IF;
END $$;

-- ============================================
-- OPTION 3: Create Admin Account
-- ============================================
-- Create an admin profile (auth user must exist first)

DO $$
DECLARE
  admin_email TEXT := 'admin@example.com';  -- Replace with admin email
  admin_user_id UUID;
  email_hash_value TEXT;
  license_id_value TEXT;
BEGIN
  -- Find admin user
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(admin_email))
    AND deleted_at IS NULL
  LIMIT 1;
  
  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin user with email % does not exist in auth.users. Please create the auth user first.', admin_email;
  END IF;

  -- Generate values
  email_hash_value := generate_email_hash(admin_email);
  license_id_value := generate_unique_license_id();
  
  -- Insert or update admin profile
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
    admin_user_id,
    admin_email,
    email_hash_value,
    license_id_value,
    'admin',           -- Admin role
    'enterprise',      -- Enterprise tier
    'active',          -- Active status
    NOW(),
    NULL,              -- No expiration for admin
    999,               -- Unlimited devices (or high limit)
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    subscription_tier = 'enterprise',
    subscription_status = 'active',
    email_hash = COALESCE(EXCLUDED.email_hash, user_profiles.email_hash),
    license_id = CASE
      WHEN user_profiles.license_id IS NULL 
           OR user_profiles.license_id = ''
           OR length(user_profiles.license_id) != 26
           OR user_profiles.license_id !~ '^[A-Za-z0-9]{25}=$'
      THEN COALESCE(EXCLUDED.license_id, generate_unique_license_id())
      ELSE user_profiles.license_id
    END,
    updated_at = NOW();
  
  RAISE NOTICE 'Admin profile created/updated for email % with user_id %', admin_email, admin_user_id;
END $$;

-- ============================================
-- OPTION 4: Helper Function to Create Account
-- ============================================
-- Create a reusable function for account creation

CREATE OR REPLACE FUNCTION public.create_user_profile_manually(
  p_user_id UUID,
  p_email TEXT,
  p_role TEXT DEFAULT 'user',
  p_subscription_tier TEXT DEFAULT 'free',
  p_subscription_status TEXT DEFAULT 'trial',
  p_max_devices INTEGER DEFAULT 1
)
RETURNS JSON AS $$
DECLARE
  email_hash_value TEXT;
  license_id_value TEXT;
  result JSON;
BEGIN
  -- Validate user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id AND deleted_at IS NULL) THEN
    RETURN json_build_object(
      'success', false,
      'error', format('User with ID %s does not exist in auth.users', p_user_id)
    );
  END IF;

  -- Generate values
  email_hash_value := generate_email_hash(p_email);
  license_id_value := generate_unique_license_id();
  
  -- Insert or update profile
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
    p_user_id,
    p_email,
    email_hash_value,
    license_id_value,
    p_role,
    p_subscription_tier,
    p_subscription_status,
    NOW(),
    CASE 
      WHEN p_subscription_status = 'trial' THEN NOW() + INTERVAL '14 days'
      ELSE NULL
    END,
    p_max_devices,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, user_profiles.email),
    email_hash = COALESCE(EXCLUDED.email_hash, user_profiles.email_hash),
    role = COALESCE(EXCLUDED.role, user_profiles.role),
    subscription_tier = COALESCE(EXCLUDED.subscription_tier, user_profiles.subscription_tier),
    subscription_status = COALESCE(EXCLUDED.subscription_status, user_profiles.subscription_status),
    max_devices = COALESCE(EXCLUDED.max_devices, user_profiles.max_devices),
    license_id = CASE
      WHEN user_profiles.license_id IS NULL 
           OR user_profiles.license_id = ''
           OR length(user_profiles.license_id) != 26
           OR user_profiles.license_id !~ '^[A-Za-z0-9]{25}=$'
      THEN COALESCE(EXCLUDED.license_id, generate_unique_license_id())
      ELSE user_profiles.license_id
    END,
    updated_at = NOW();
  
  -- Get the created profile
  SELECT json_build_object(
    'success', true,
    'user_id', p_user_id,
    'email', p_email,
    'license_id', license_id_value,
    'role', p_role,
    'subscription_tier', p_subscription_tier,
    'subscription_status', p_subscription_status
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_user_profile_manually(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) 
TO postgres, authenticated, service_role;

-- ============================================
-- USAGE EXAMPLES
-- ============================================

-- Example 1: Create profile using the helper function
-- SELECT create_user_profile_manually(
--   'YOUR_USER_UUID_HERE'::UUID,
--   'user@example.com',
--   'user',           -- role
--   'free',           -- subscription_tier
--   'trial',          -- subscription_status
--   1                 -- max_devices
-- );

-- Example 2: Create admin profile using the helper function
-- SELECT create_user_profile_manually(
--   'YOUR_ADMIN_UUID_HERE'::UUID,
--   'admin@example.com',
--   'admin',          -- role
--   'enterprise',     -- subscription_tier
--   'active',         -- subscription_status
--   999               -- max_devices
-- );

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check if profile was created successfully
-- SELECT 
--   up.id,
--   up.email,
--   up.role,
--   up.subscription_tier,
--   up.subscription_status,
--   up.license_id,
--   up.created_at,
--   au.email_confirmed_at,
--   au.created_at as auth_created_at
-- FROM public.user_profiles up
-- JOIN auth.users au ON up.id = au.id
-- WHERE up.email = 'user@example.com';

-- Find all accounts by email
-- SELECT * FROM find_accounts_by_email('user@example.com');

-- ============================================
-- IMPORTANT: Creating Auth Users with Passwords
-- ============================================
-- 
-- ⚠️ PASSWORDS ARE NOT STORED IN public.user_profiles ⚠️
-- Passwords are stored in auth.users table (hashed) and managed by Supabase Auth.
-- You CANNOT set passwords via SQL for security reasons.
--
-- You must create the auth user (with password) using one of these methods:
--
-- 1. Supabase Dashboard (Easiest):
--    - Go to Authentication > Users
--    - Click "Add User" or "Invite User"
--    - Enter email and password
--    - Password will be hashed and stored in auth.users table
--
-- 2. Supabase Admin API (using service role key):
--    POST https://YOUR_PROJECT.supabase.co/auth/v1/admin/users
--    Headers:
--      - apikey: YOUR_SERVICE_ROLE_KEY
--      - Authorization: Bearer YOUR_SERVICE_ROLE_KEY
--      - Content-Type: application/json
--    Body:
--      {
--        "email": "user@example.com",
--        "password": "secure_password_here",  ← PASSWORD SET HERE
--        "email_confirm": true
--      }
--
-- 3. Using JavaScript/TypeScript (Admin API) - DO NOT RUN THIS IN SQL EDITOR:
--    This is JavaScript code - run it in your Node.js/TypeScript application, NOT in SQL editor!
--    
--    const { createClient } = require('@supabase/supabase-js');
--    const supabase = createClient(
--      'YOUR_SUPABASE_URL',
--      'YOUR_SERVICE_ROLE_KEY'
--    );
--    
--    const { data, error } = await supabase.auth.admin.createUser({
--      email: 'user@example.com',
--      password: 'secure_password_here',  ← PASSWORD SET HERE
--      email_confirm: true
--    });
--
-- 4. After creating the auth user (with password), run one of the SQL options above
--    to create the profile in public.user_profiles
--
-- WHERE PASSWORDS ARE STORED:
-- - Table: auth.users (managed by Supabase, not directly accessible)
-- - Column: encrypted_password (hashed, not readable)
-- - NOT in: public.user_profiles (this table only has profile data)
--
-- ============================================

