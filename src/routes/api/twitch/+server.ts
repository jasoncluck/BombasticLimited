import {} from "@twurple/eventsub-http";
import { eventSubListener } from "$lib/client/twitch.js";
import { SOURCE_INFO, SOURCES } from "$lib/constants/source.js";
import { produce } from "sveltekit-sse";

/**
 * @param {number} milliseconds
 * @returns
 */
function delay(milliseconds: number) {
  return new Promise(function run(resolve) {
    setTimeout(resolve, milliseconds);
  });
}

const streamingSources = new Set<string>();
let subscriptions: any[] = [];

// Only set up subscriptions if eventSubListener is available
if (eventSubListener) {
  SOURCES.map((source) => {
    subscriptions.push(
      eventSubListener!.onStreamOnline(SOURCE_INFO[source].twitchId, () => {
        console.log(`${source} has started streaming on Twitch.`);
        streamingSources.add(source);
      }),
    );

    subscriptions.push(
      eventSubListener!.onStreamOffline(SOURCE_INFO[source].twitchId, () => {
        console.log(`${source} has ended the Twitch stream.`);

        streamingSources.delete(source);
      }),
    );
  });
}
export async function POST() {
  return produce(
    async function start({ emit }) {
      // NOTE: Uncomment this to log out test CLI commands for Twitch webhooks
      subscriptions.map(async (subscription) => {
        console.log(await subscription.getCliTestCommand());
      });

      while (true) {
        const { error } = emit(
          "streamingSubscriptions",
          JSON.stringify(Array.from(streamingSources.values())),
        );
        if (error) {
          // console.error(error);
          return;
        }
        await delay(10000);
      }
    },
    {
      stop() {
        console.log("Calling stop function");
      },
    },
  );
}
