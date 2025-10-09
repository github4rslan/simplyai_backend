-- Migration: Add last_activity column to profiles table
ALTER TABLE profiles ADD COLUMN last_activity DATETIME NULL AFTER updated_at;
