exports.handler = async (event, context) => {
  // Handle Twitch EventSub webhook
  const { body, headers } = event;

  // Verify the webhook signature
  const signature = headers["twitch-eventsub-message-signature"];
  const messageId = headers["twitch-eventsub-message-id"];
  const timestamp = headers["twitch-eventsub-message-timestamp"];
  const messageType = headers["twitch-eventsub-message-type"];

  // Your EventSub handling logic here
  console.log("Received webhook:", { messageType, messageId });

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
