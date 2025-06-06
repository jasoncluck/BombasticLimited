CREATE TYPE "public"."playlist_type" AS ENUM (
    'Official',
    'Public',
    'Private'
);

ALTER TABLE public.playlists add "type" playlist_type NOT NULL DEFAULT 'Private';

ALTER TABLE public.playlist_videos add "user_id" "uuid" NOT NULL;

ALTER TABLE ONLY "public"."playlist_videos"
    ADD CONSTRAINT "playlist_videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE POLICY "Enable delete for authenticated users only" ON "public"."playlist_videos" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));
