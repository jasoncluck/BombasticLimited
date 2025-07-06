

BEGIN;
ALTER TABLE public.playlists
    ADD COLUMN image_properties jsonb;

ALTER TABLE public.playlists 
ADD CONSTRAINT image_properties_structure_check 
CHECK (
  image_properties IS NULL OR 
  (
    image_properties ? 'x' AND 
    image_properties ? 'y' AND 
    image_properties ? 'height' AND 
    image_properties ? 'width' AND
    jsonb_typeof(image_properties->'x') = 'number' AND
    jsonb_typeof(image_properties->'y') = 'number' AND
    jsonb_typeof(image_properties->'height') = 'number' AND
    jsonb_typeof(image_properties->'width') = 'number'
  )
);

COMMIT;
