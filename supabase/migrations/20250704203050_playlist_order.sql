ALTER TABLE public.timestamps
ADD COLUMN sorted_by playlist_sorted_by DEFAULT NULL,
ADD COLUMN sort_order playlist_sort_order DEFAULT NULL;
