-- Add username field to user_profiles table
-- Run this SQL in your Supabase SQL Editor

-- Add username column (nullable, unique)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);

-- Update the trigger function to include username (optional, can be set later)
-- Note: Username will be NULL initially and users can set it in their profile settings

