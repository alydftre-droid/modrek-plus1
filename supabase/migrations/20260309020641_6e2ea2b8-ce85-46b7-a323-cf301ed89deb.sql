-- Add sub_subject column to content table for sub-subject filtering (نحو، صرف، بلاغة، etc.)
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS sub_subject text DEFAULT NULL;