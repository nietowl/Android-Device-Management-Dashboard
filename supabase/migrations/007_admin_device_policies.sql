-- Add admin policies for device management
-- Run this SQL in your Supabase SQL Editor

-- Policy: Admins can view all devices
CREATE POLICY "Admins can view all devices"
  ON devices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Note: Admins can already view devices through the API using service role,
-- but this policy allows direct database access for admin queries

