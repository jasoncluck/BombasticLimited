import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  NGROK_AUTH_TOKEN,
} from '$env/static/private';
import {
  DirectConnectionAdapter,
  EventSubHttpListener,
} from '@twurple/eventsub-http';
import { randomUUID } from 'crypto';
import { NgrokAdapter } from '@twurple/eventsub-ngrok';

const clientId = TWITCH_CLIENT_ID;
const clientSecret = TWITCH_CLIENT_SECRET;

// Only initialize Twitch client if we have real credentials and not during build
const shouldInitialize =
  clientId !== 'placeholder_client_id' &&
  clientSecret !== 'placeholder_client_secret' &&
  typeof window === 'undefined' && // Server-side only
  process.env.NODE_ENV !== 'test';

let authProvider: AppTokenAuthProvider | undefined;
let apiClient: ApiClient | undefined;
let eventSubListener: EventSubHttpListener | undefined;

// if (shouldInitialize) {
//   authProvider = new AppTokenAuthProvider(clientId, clientSecret);
//   apiClient = new ApiClient({ authProvider });

// let adapter: NgrokAdapter | DirectConnectionAdapter;
// if (import.meta.env.DEV) {
//   adapter = new NgrokAdapter({
//     ngrokConfig: { authtoken: NGROK_AUTH_TOKEN },
//   });
//
//   const secret = randomUUID();
//
//   // Only delete subscriptions and start listener if we have a real client
//   if (apiClient) {
//     await apiClient.eventSub.deleteAllSubscriptions();
//
//     eventSubListener = new EventSubHttpListener({
//       apiClient,
//       adapter,
//       secret,
//     });
//
//     eventSubListener.start();
//   }
// }
// }

export { eventSubListener };
