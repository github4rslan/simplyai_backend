-- Migration: Add plan_type column to subscription_plans
ALTER TABLE subscription_plans ADD COLUMN plan_type VARCHAR(50) DEFAULT 'single';
