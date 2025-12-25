-- ============================================
-- FIX MISSING USER PROFILES
-- This migration creates profiles for any auth.users that don't have a profile
-- ============================================

-- First, ensure the trigger function exists and is correct
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

-- Ensure trigger exists and is active
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- Create profiles for any existing auth.users that don't have a profile
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

-- Grant necessary permissions to ensure trigger can insert
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_email_hash(TEXT) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_license_id() TO postgres, anon, authenticated, service_role;

-- Ensure service role can insert (for fallback)
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.user_profiles;
CREATE POLICY "Service role can insert profiles"
  ON public.user_profiles FOR INSERT
  WITH CHECK (true);

