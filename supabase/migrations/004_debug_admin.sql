-- Debug and Fix Admin Status
-- Run this in Supabase SQL Editor to check and fix admin status

-- First, check if user_profiles table exists and see all users
SELECT id, email, role, subscription_tier, subscription_status, is_active 
FROM user_profiles 
ORDER BY created_at DESC;

-- Check if your specific user exists
SELECT id, email, role 
FROM user_profiles 
WHERE email = 'darwaipranav@gmail.com';

-- If the user exists but is not admin, make them admin:
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'darwaipranav@gmail.com';

-- If the user doesn't exist, you need to create a profile manually
-- First, get your user ID from auth.users:
SELECT id, email FROM auth.users WHERE email = 'darwaipranav@gmail.com';

-- Then create the profile (replace USER_ID_HERE with the actual ID):
-- INSERT INTO user_profiles (
--   id, 
--   email, 
--   role, 
--   subscription_tier, 
--   subscription_status,
--   subscription_start_date,
--   subscription_end_date,
--   max_devices,
--   is_active
-- ) VALUES (
--   'USER_ID_HERE',
--   'darwaipranav@gmail.com',
--   'admin',
--   'enterprise',
--   'active',
--   NOW(),
--   NOW() + INTERVAL '1 year',
--   999,
--   true
-- );

-- Verify admin status:
SELECT id, email, role FROM user_profiles WHERE email = 'darwaipranav@gmail.com';

