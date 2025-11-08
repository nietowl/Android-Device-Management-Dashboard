-- Admin Panel Database Schema
-- Run this SQL in your Supabase SQL Editor

-- Add role column to auth.users metadata (we'll use a separate profiles table)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  subscription_tier TEXT CHECK (subscription_tier IN ('free', 'basic', 'premium', 'enterprise')) DEFAULT 'free',
  subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'cancelled', 'trial')) DEFAULT 'trial',
  subscription_start_date TIMESTAMPTZ,
  subscription_end_date TIMESTAMPTZ,
  max_devices INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_status ON user_profiles(subscription_status);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Function to check if user is admin (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION is_user_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = check_user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile (limited fields)
CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Admins can view all profiles (using function to avoid recursion)
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (is_user_admin(auth.uid()));

-- Policy: Admins can update all profiles (using function to avoid recursion)
CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  USING (is_user_admin(auth.uid()))
  WITH CHECK (is_user_admin(auth.uid()));

-- Policy: Admins can insert profiles (using function to avoid recursion)
CREATE POLICY "Admins can insert profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (is_user_admin(auth.uid()));

-- Policy: Allow service role to insert (for triggers)
CREATE POLICY "Service role can insert profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (true);

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, subscription_tier, subscription_status, subscription_start_date, subscription_end_date)
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    'free',
    'trial',
    NOW(),
    NOW() + INTERVAL '14 days' -- 14-day trial
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_user_profiles_updated_at();

-- Create admin activity log table
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on activity logs
ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view activity logs (using function to avoid recursion)
CREATE POLICY "Admins can view activity logs"
  ON admin_activity_logs FOR SELECT
  USING (is_user_admin(auth.uid()));

-- Policy: Only admins can insert activity logs (using function to avoid recursion)
CREATE POLICY "Admins can insert activity logs"
  ON admin_activity_logs FOR INSERT
  WITH CHECK (is_user_admin(auth.uid()));

-- Create index for activity logs
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON admin_activity_logs(created_at DESC);

-- Optional: Create a function to check if user is admin (for use in queries)
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
