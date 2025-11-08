-- Make First User Admin
-- Run this SQL in your Supabase SQL Editor after creating your first account
-- Replace 'your-email@example.com' with your actual email

UPDATE user_profiles
SET role = 'admin'
WHERE email = 'darwaipranav@gmail.com'
LIMIT 1;

-- Or if you know the user ID:
-- UPDATE user_profiles
-- SET role = 'admin'
-- WHERE id = 'user-uuid-here';

