import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { CHANNEL_SOURCES, ChannelSource } from '../channel';

const sfn = new SFNClient({});

export async function handler(event: {
  source: ChannelSource;
  sources: ChannelSource[];
}) {
  try {
    const { source, sources } = event;

    // If specific source provided, use that; otherwise use all sources
    const sourcesToProcess = source ? [source] : sources || CHANNEL_SOURCES;

    const executionName = `repopulate-${Date.now()}`;

    const command = new StartExecutionCommand({
      stateMachineArn: process.env.STATE_MACHINE_ARN!,
      name: executionName,
      input: JSON.stringify({
        sources: sourcesToProcess,
      }),
    });

    const result = await sfn.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Repopulation started',
        executionArn: result.executionArn,
        sources: sourcesToProcess,
      }),
    };
  } catch (error) {
    console.error('Error starting repopulation:', error);
    throw error;
  }
}
