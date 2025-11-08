-- Android Device Management Dashboard Database Schema
-- Run this SQL in your Supabase SQL Editor

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT CHECK (status IN ('online', 'offline')) DEFAULT 'offline',
  last_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- Enable Row Level Security
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Create policy for users to only see their own devices
CREATE POLICY "Users can view their own devices"
  ON devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices"
  ON devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices"
  ON devices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
  ON devices FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create tables for SMS, Contacts, Call Logs, Files (for future use)
-- These can be added later as needed

-- CREATE TABLE IF NOT EXISTS sms_messages (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
--   address TEXT NOT NULL,
--   body TEXT NOT NULL,
--   date TIMESTAMPTZ NOT NULL,
--   type TEXT CHECK (type IN ('sent', 'received')) NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS contacts (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
--   name TEXT NOT NULL,
--   phone TEXT NOT NULL,
--   email TEXT,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS call_logs (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
--   number TEXT NOT NULL,
--   name TEXT,
--   type TEXT CHECK (type IN ('incoming', 'outgoing', 'missed')) NOT NULL,
--   duration INTEGER DEFAULT 0,
--   date TIMESTAMPTZ NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS file_items (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
--   path TEXT NOT NULL,
--   name TEXT NOT NULL,
--   type TEXT CHECK (type IN ('file', 'directory')) NOT NULL,
--   size BIGINT,
--   modified TIMESTAMPTZ NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

