-- Migration: 15_image-processing.sql
-- This migration has been disabled as image processing functionality has been removed
-- All image processing triggers and functions are no longer needed

-- Image processing functionality has been removed from the system
-- The following content is commented out:

/*
-- Function to call image processing webhook
CREATE OR REPLACE FUNCTION public.trigger_image_processing()
RETURNS TRIGGER AS $$
... [rest of the function content]
*/
