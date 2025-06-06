import { AppTokenAuthProvider } from "@twurple/auth";
import { ApiClient } from "@twurple/api";
import {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  NGROK_AUTH_TOKEN,
} from "$env/static/private";
import { EventSubHttpListener } from "@twurple/eventsub-http";
import { randomUUID } from "crypto";
import { NgrokAdapter } from "@twurple/eventsub-ngrok";

const clientId = TWITCH_CLIENT_ID;
const clientSecret = TWITCH_CLIENT_SECRET;

const authProvider = new AppTokenAuthProvider(clientId, clientSecret);

const apiClient = new ApiClient({ authProvider });

const adapter = new NgrokAdapter({
  ngrokConfig: { authtoken: NGROK_AUTH_TOKEN },
});

const secret = randomUUID();

await apiClient.eventSub.deleteAllSubscriptions();

export const eventSubListener = new EventSubHttpListener({
  apiClient,
  adapter,
  secret,
});

eventSubListener.start();
