# Admin Panel Setup Guide

## Step 1: Run the Database Migration

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the entire contents of `supabase/migrations/002_admin_panel_schema.sql`
5. Click **Run** (or press Ctrl+Enter)
6. Wait for it to complete successfully

## Step 2: Verify Table Creation

Run this query to verify the table was created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'user_profiles';
```

You should see `user_profiles` in the results.

## Step 3: Create Your Admin Profile

Since you already have an account, you need to manually create your profile. Run this SQL (replace with your actual user ID if needed):

```sql
-- First, get your user ID
SELECT id, email FROM auth.users WHERE email = 'darwaipranav@gmail.com';

-- Then create your profile (replace USER_ID with the ID from above)
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
  'admin',
  'enterprise',
  'active',
  NOW(),
  NOW() + INTERVAL '1 year',
  999,
  true
FROM auth.users
WHERE email = 'darwaipranav@gmail.com';
```

## Step 4: Verify Admin Status

Run this to verify:

```sql
SELECT id, email, role, subscription_tier, subscription_status 
FROM user_profiles 
WHERE email = 'darwaipranav@gmail.com';
```

You should see `role = 'admin'`.

## Step 5: Refresh Your Browser

1. Go back to your app
2. Refresh the page (F5)
3. Try accessing `/dashboard/admin` again

## Troubleshooting

If you get errors:
- Make sure you're running the SQL in the Supabase SQL Editor
- Check for any error messages in the SQL Editor
- Make sure RLS policies are enabled (they should be created by the migration)

