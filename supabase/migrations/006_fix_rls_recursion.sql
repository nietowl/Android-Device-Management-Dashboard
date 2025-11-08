-- Fix Infinite Recursion in RLS Policies
-- Run this AFTER running 002_admin_panel_schema.sql if you get recursion errors

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view activity logs" ON admin_activity_logs;
DROP POLICY IF EXISTS "Admins can insert activity logs" ON admin_activity_logs;

-- Create function to check admin status (bypasses RLS)
CREATE OR REPLACE FUNCTION is_user_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = check_user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate policies using the function (avoids recursion)
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (is_user_admin(auth.uid()));

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  USING (is_user_admin(auth.uid()))
  WITH CHECK (is_user_admin(auth.uid()));

CREATE POLICY "Admins can insert profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (is_user_admin(auth.uid()));

-- Allow service role to insert (for triggers)
CREATE POLICY "Service role can insert profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view activity logs"
  ON admin_activity_logs FOR SELECT
  USING (is_user_admin(auth.uid()));

CREATE POLICY "Admins can insert activity logs"
  ON admin_activity_logs FOR INSERT
  WITH CHECK (is_user_admin(auth.uid()));

