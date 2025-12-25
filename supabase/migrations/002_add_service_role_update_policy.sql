-- ============================================
-- ADD SERVICE ROLE UPDATE POLICY
-- This migration adds an UPDATE policy for service role
-- to allow upsert operations in the signup route
-- ============================================

-- Add UPDATE policy for service role (for upsert operations)
DROP POLICY IF EXISTS "Service role can update profiles" ON public.user_profiles;
CREATE POLICY "Service role can update profiles"
  ON public.user_profiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

