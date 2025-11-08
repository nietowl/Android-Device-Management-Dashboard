-- Quick Setup: Create Admin Profile for Existing User
-- Run this AFTER running 002_admin_panel_schema.sql

-- This will create a profile for your existing user and make them admin
INSERT INTO user_profiles (
  id, 
  email, 
  role, 
  subscription_tier, 
  subscription_status,
  subscription_start_date,
  subscription_end_date,
  max_devices,
  is_active
) 
SELECT 
  id,
  email,
  'admin',  -- Make them admin
  'enterprise',
  'active',
  NOW(),
  NOW() + INTERVAL '1 year',  -- 1 year subscription
  999,  -- Unlimited devices
  true
FROM auth.users
WHERE email = 'darwaipranav@gmail.com'
ON CONFLICT (id) DO UPDATE 
SET 
  role = 'admin',
  subscription_tier = 'enterprise',
  subscription_status = 'active',
  is_active = true;

-- Verify it worked
SELECT id, email, role, subscription_tier, subscription_status 
FROM user_profiles 
WHERE email = 'darwaipranav@gmail.com';

