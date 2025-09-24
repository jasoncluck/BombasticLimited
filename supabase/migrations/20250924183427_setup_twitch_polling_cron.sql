-- Setup Supabase cron for Twitch stream polling edge function, run every minute
SELECT
  cron.schedule (
    'invoke-poll-twitch-streams-every-minute',
    '* * * * *', -- every minute
    $$
  SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/poll-twitch-streams',
      headers := jsonb_build_object(
          'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('time', now()::text)
  );
  $$
  );
