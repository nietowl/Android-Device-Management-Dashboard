-- ============================================
-- COMPLETE SUPABASE DATABASE SETUP
-- Android Device Management Dashboard
-- ============================================
-- 
-- This is a comprehensive setup file that contains everything needed
-- to set up a new Supabase database from scratch.
--
-- USAGE INSTRUCTIONS:
-- 1. Open your Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Copy and paste this entire file
-- 4. Click "Run" to execute
-- 5. Verify the setup with the verification messages at the end
--
-- This file is idempotent - safe to run multiple times.
-- ============================================

-- ============================================
-- PART 1: USER PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT,
  email_hash TEXT,
  license_id TEXT,
  role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  subscription_tier TEXT CHECK (subscription_tier IN ('free', 'basic', 'premium', 'enterprise')) DEFAULT 'free',
  subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'cancelled', 'trial')) DEFAULT 'trial',
  subscription_start_date TIMESTAMPTZ,
  subscription_end_date TIMESTAMPTZ,
  license_key_validity TIMESTAMPTZ,
  max_devices INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_status ON public.user_profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email_hash ON public.user_profiles(email_hash);
CREATE INDEX IF NOT EXISTS idx_user_profiles_license_id ON public.user_profiles(license_id) WHERE license_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_license_key_validity ON public.user_profiles(license_key_validity) WHERE license_key_validity IS NOT NULL;

-- Unique constraint on email (case-insensitive) to prevent duplicates
DROP INDEX IF EXISTS idx_user_profiles_email_unique;
CREATE UNIQUE INDEX idx_user_profiles_email_unique 
ON public.user_profiles(LOWER(TRIM(email)))
WHERE email IS NOT NULL;

-- Unique constraint on license_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_license_id_unique 
ON public.user_profiles(license_id) 
WHERE license_id IS NOT NULL;

-- ============================================
-- PART 2: DEVICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT CHECK (status IN ('online', 'offline')) DEFAULT 'offline',
  last_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure foreign key constraint exists with correct name
DO $$
DECLARE
  fk_exists BOOLEAN;
  fk_name TEXT;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'devices'
      AND constraint_name = 'devices_user_id_fkey'
  ) INTO fk_exists;
  
  IF NOT fk_exists THEN
    SELECT constraint_name INTO fk_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'devices'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name != 'devices_user_id_fkey'
    LIMIT 1;
    
    IF fk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS %I', fk_name);
    END IF;
    
    ALTER TABLE public.devices
    ADD CONSTRAINT devices_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for devices
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_sync ON public.devices(last_sync);

-- ============================================
-- PART 3: ADMIN ACTIVITY LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON public.admin_activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON public.admin_activity_logs(created_at DESC);

-- ============================================
-- PART 4: HELPER FUNCTIONS
-- ============================================

-- Function to check if user is admin (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_user_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = check_user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate email hash (SHA-256)
CREATE OR REPLACE FUNCTION public.generate_email_hash(email_address TEXT)
RETURNS TEXT AS $$
BEGIN
  IF email_address IS NULL OR email_address = '' THEN
    RETURN NULL;
  END IF;
  RETURN encode(digest(lower(trim(email_address)), 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate license ID (26 characters: 25 alphanumeric + '=')
CREATE OR REPLACE FUNCTION public.generate_license_id()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..25 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result || '=';
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique license ID
CREATE OR REPLACE FUNCTION public.generate_unique_license_id()
RETURNS TEXT AS $$
DECLARE
  new_license_id TEXT;
  exists_check INTEGER;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    new_license_id := generate_license_id();
    
    SELECT COUNT(*) INTO exists_check
    FROM public.user_profiles
    WHERE license_id = new_license_id;
    
    IF exists_check = 0 THEN
      RETURN new_license_id;
    END IF;
    
    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      new_license_id := generate_license_id() || substr(encode(digest(now()::text || random()::text, 'sha256'), 'hex'), 1, 1);
      RETURN new_license_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update user_profiles updated_at
CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to merge duplicate accounts by email
CREATE OR REPLACE FUNCTION public.merge_duplicate_accounts_by_email(
  keep_email TEXT,
  merge_email TEXT
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  keep_user_id UUID;
  merge_user_id UUID;
  merged_devices INTEGER;
  keep_email_normalized TEXT;
  merge_email_normalized TEXT;
BEGIN
  keep_email_normalized := LOWER(TRIM(keep_email));
  merge_email_normalized := LOWER(TRIM(merge_email));
  
  IF keep_email_normalized = merge_email_normalized THEN
    RAISE EXCEPTION 'Cannot merge account with itself';
  END IF;
  
  SELECT id INTO keep_user_id
  FROM auth.users
  WHERE LOWER(TRIM(email)) = keep_email_normalized
  LIMIT 1;
  
  IF keep_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email "%" not found', keep_email;
  END IF;
  
  SELECT id INTO merge_user_id
  FROM auth.users
  WHERE LOWER(TRIM(email)) = merge_email_normalized
  LIMIT 1;
  
  IF merge_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email "%" not found', merge_email;
  END IF;
  
  -- Transfer devices (if table exists)
  merged_devices := 0;
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'devices') THEN
      UPDATE public.devices
      SET user_id = keep_user_id, updated_at = NOW()
      WHERE user_id = merge_user_id;
      GET DIAGNOSTICS merged_devices = ROW_COUNT;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Could not transfer devices: %', SQLERRM;
  END;
  
  -- Update activity logs (if table exists)
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_activity_logs') THEN
      UPDATE public.admin_activity_logs
      SET target_user_id = keep_user_id
      WHERE target_user_id = merge_user_id;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Could not update activity logs: %', SQLERRM;
  END;
  
  -- Delete the profile of the user being merged
  DELETE FROM public.user_profiles WHERE id = merge_user_id;
  
  result := json_build_object(
    'success', true,
    'kept_email', keep_email,
    'merged_email', merge_email,
    'kept_user_id', keep_user_id,
    'merged_user_id', merge_user_id,
    'devices_transferred', merged_devices,
    'message', 'Account merged successfully. The auth user still exists and should be deleted manually from Supabase dashboard if needed.'
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find accounts by email
CREATE OR REPLACE FUNCTION public.find_accounts_by_email(search_email TEXT)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  has_profile BOOLEAN,
  profile_role TEXT,
  profile_status TEXT,
  license_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.email,
    au.created_at,
    au.email_confirmed_at,
    CASE WHEN up.id IS NOT NULL THEN true ELSE false END,
    up.role,
    up.subscription_status,
    up.license_id
  FROM auth.users au
  LEFT JOIN public.user_profiles up ON au.id = up.id
  WHERE LOWER(TRIM(au.email)) = LOWER(TRIM(search_email))
  ORDER BY au.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 5: USER PROFILE CREATION TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  email_hash_value TEXT;
  license_id_value TEXT;
  existing_profile_id UUID;
BEGIN
  -- Check if profile already exists for this email (case-insensitive)
  SELECT id INTO existing_profile_id
  FROM public.user_profiles
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
  LIMIT 1;
  
  IF existing_profile_id IS NOT NULL AND existing_profile_id != NEW.id THEN
    RAISE WARNING 'Profile already exists for email % with id %. Skipping profile creation for new user %.', 
      NEW.email, existing_profile_id, NEW.id;
    RETURN NEW;
  END IF;
  
  -- Generate email hash
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    email_hash_value := generate_email_hash(NEW.email);
  ELSE
    email_hash_value := NULL;
  END IF;
  
  -- ALWAYS generate a unique license ID for new user
  license_id_value := generate_unique_license_id();
  
  -- Insert user profile with all required fields
  INSERT INTO public.user_profiles (
    id, 
    email, 
    email_hash, 
    license_id, 
    role, 
    subscription_tier, 
    subscription_status, 
    subscription_start_date, 
    subscription_end_date
  )
  VALUES (
    NEW.id,
    NEW.email,
    email_hash_value,
    license_id_value,
    'user',
    'free',
    'trial',
    NOW(),
    NOW() + INTERVAL '14 days'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, user_profiles.email),
    email_hash = COALESCE(EXCLUDED.email_hash, user_profiles.email_hash),
    license_id = CASE
      WHEN user_profiles.license_id IS NULL 
           OR user_profiles.license_id = ''
           OR length(user_profiles.license_id) != 26
           OR user_profiles.license_id !~ '^[A-Za-z0-9]{25}=$'
      THEN COALESCE(EXCLUDED.license_id, generate_unique_license_id())
      ELSE user_profiles.license_id
    END;
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RAISE WARNING 'Duplicate email detected for user %: %. Skipping profile creation.', NEW.id, NEW.email;
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user trigger for user %: %', NEW.id, SQLERRM;
    BEGIN
      INSERT INTO public.user_profiles (
        id, 
        email, 
        role, 
        subscription_tier, 
        subscription_status, 
        subscription_start_date, 
        subscription_end_date
      )
      VALUES (
        NEW.id,
        NEW.email,
        'user',
        'free',
        'trial',
        NOW(),
        NOW() + INTERVAL '14 days'
      )
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Fallback insert also failed for user %: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- Create trigger to update updated_at on user_profiles
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at 
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_user_profiles_updated_at();

-- Create trigger to update updated_at on devices
DROP TRIGGER IF EXISTS update_devices_updated_at ON public.devices;
CREATE TRIGGER update_devices_updated_at 
  BEFORE UPDATE ON public.devices
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PART 6: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts (idempotent)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role can update profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow trigger to insert profiles" ON public.user_profiles;

DROP POLICY IF EXISTS "Users can view their own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can insert their own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can update their own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can delete their own devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can view all devices" ON public.devices;

DROP POLICY IF EXISTS "Admins can view activity logs" ON public.admin_activity_logs;
DROP POLICY IF EXISTS "Admins can insert activity logs" ON public.admin_activity_logs;

-- User Profiles Policies
CREATE POLICY "Users can view their own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles FOR SELECT
  USING (is_user_admin(auth.uid()));

CREATE POLICY "Admins can update all profiles"
  ON public.user_profiles FOR UPDATE
  USING (is_user_admin(auth.uid()))
  WITH CHECK (is_user_admin(auth.uid()));

CREATE POLICY "Admins can insert profiles"
  ON public.user_profiles FOR INSERT
  WITH CHECK (is_user_admin(auth.uid()));

CREATE POLICY "Service role can insert profiles"
  ON public.user_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update profiles"
  ON public.user_profiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow trigger to insert profiles"
  ON public.user_profiles FOR INSERT
  WITH CHECK (true);

-- Devices Policies
CREATE POLICY "Users can view their own devices"
  ON public.devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices"
  ON public.devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices"
  ON public.devices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
  ON public.devices FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all devices"
  ON public.devices FOR SELECT
  USING (is_user_admin(auth.uid()));

-- Admin Activity Logs Policies
CREATE POLICY "Admins can view activity logs"
  ON public.admin_activity_logs FOR SELECT
  USING (is_user_admin(auth.uid()));

CREATE POLICY "Admins can insert activity logs"
  ON public.admin_activity_logs FOR INSERT
  WITH CHECK (is_user_admin(auth.uid()));

-- ============================================
-- PART 7: DUPLICATE EMAIL HANDLING
-- ============================================

-- Clean up duplicate profiles (keep oldest)
DELETE FROM public.user_profiles up1
WHERE EXISTS (
  SELECT 1 
  FROM public.user_profiles up2
  WHERE LOWER(TRIM(up2.email)) = LOWER(TRIM(up1.email))
    AND up2.id != up1.id
    AND up2.created_at < up1.created_at
);

-- ============================================
-- PART 8: BACKFILL EXISTING DATA
-- ============================================

-- Backfill email hashes for existing users
UPDATE public.user_profiles
SET email_hash = generate_email_hash(email)
WHERE (email_hash IS NULL OR email_hash = '')
  AND email IS NOT NULL 
  AND email != '';

-- Backfill license_ids for existing users
UPDATE public.user_profiles
SET license_id = generate_unique_license_id()
WHERE license_id IS NULL 
   OR license_id = ''
   OR length(license_id) != 26
   OR license_id !~ '^[A-Za-z0-9]{25}=$';

-- Create profiles for any auth.users that don't have a profile yet
INSERT INTO public.user_profiles (
  id, email, email_hash, license_id, role, subscription_tier, 
  subscription_status, subscription_start_date, subscription_end_date, 
  created_at, updated_at
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
ON CONFLICT (id) DO UPDATE SET
  email = COALESCE(EXCLUDED.email, user_profiles.email),
  email_hash = COALESCE(EXCLUDED.email_hash, user_profiles.email_hash),
  license_id = CASE
    WHEN user_profiles.license_id IS NULL 
         OR user_profiles.license_id = ''
         OR length(user_profiles.license_id) != 26
         OR user_profiles.license_id !~ '^[A-Za-z0-9]{25}=$'
    THEN COALESCE(EXCLUDED.license_id, generate_unique_license_id())
    ELSE user_profiles.license_id
  END;

-- Update any existing profiles that are missing license_id
UPDATE public.user_profiles
SET license_id = generate_unique_license_id()
WHERE license_id IS NULL 
   OR license_id = ''
   OR length(license_id) != 26
   OR license_id !~ '^[A-Za-z0-9]{25}=$';

-- ============================================
-- PART 9: GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_email_hash(TEXT) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_license_id() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_accounts_by_email(TEXT, TEXT) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_accounts_by_email(TEXT) TO postgres, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT SELECT ON public.devices TO anon;

-- ============================================
-- PART 10: FINAL VERIFICATION
-- ============================================
DO $$
DECLARE
  total_auth_users INTEGER;
  total_profiles INTEGER;
  profiles_with_license INTEGER;
  profiles_with_email_hash INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_auth_users FROM auth.users;
  SELECT COUNT(*) INTO total_profiles FROM public.user_profiles;
  SELECT COUNT(*) INTO profiles_with_license FROM public.user_profiles WHERE license_id IS NOT NULL AND length(license_id) = 26;
  SELECT COUNT(*) INTO profiles_with_email_hash FROM public.user_profiles WHERE email_hash IS NOT NULL;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ COMPLETE DATABASE SETUP FINISHED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total auth.users: %', total_auth_users;
  RAISE NOTICE 'Total user_profiles: %', total_profiles;
  RAISE NOTICE 'Profiles with license_id: %', profiles_with_license;
  RAISE NOTICE 'Profiles with email_hash: %', profiles_with_email_hash;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'USEFUL FUNCTIONS:';
  RAISE NOTICE '1. Find accounts: SELECT * FROM find_accounts_by_email(''email@example.com'');';
  RAISE NOTICE '2. Merge duplicates: SELECT merge_duplicate_accounts_by_email(''keep@email.com'', ''merge@email.com'');';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'SETUP COMPLETE! Your database is ready to use.';
  RAISE NOTICE '========================================';
END $$;

