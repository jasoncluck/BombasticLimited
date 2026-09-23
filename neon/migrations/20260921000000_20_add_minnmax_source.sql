-- Add MinnMax as a content source.
ALTER TYPE "public"."source"
ADD VALUE IF NOT EXISTS 'minnmax';
