
BEGIN;

-- Create the pg_jsonschema extension if it does not already exist
CREATE EXTENSION IF NOT EXISTS pg_jsonschema WITH SCHEMA extensions;

COMMIT;

BEGIN;
ALTER TABLE public.playlists
    ADD COLUMN image_properties jsonb;

-- Step 1: Add the CHECK constraint to validate the properties column
ALTER TABLE public.playlists
ADD CONSTRAINT image_properties_schema_check
CHECK (
    jsonb_matches_schema(
        schema := '{
            "type": "object",
            "properties": {
                "x": { "type": "number" },
                "y": { "type": "number" },
                "height": { "type": "number" },
                "width": { "type": "number" }
            },
            "required": ["x", "y", "height", "width"],
            "additionalProperties": false
        }',
        instance := image_properties
    )
);

COMMIT;
