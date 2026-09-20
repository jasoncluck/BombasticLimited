import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

interface CronStackProps extends StackProps {
  stage: 'Production' | 'Staging';
  neonDatabaseUrl: string;
  twitchClientId: string;
  twitchClientSecret: string;
  triggerSecretKey: string;
  contentImagesBucket: string;
}

/**
 * Replaces Supabase's pg_cron + pg_net + vault jobs (which called Supabase
 * Edge Functions) with EventBridge-scheduled Lambdas that connect to Neon
 * directly. See ~/.claude/plans/vectorized-riding-lake.md.
 */
export class CronStack extends Stack {
  constructor(scope: Construct, id: string, props: CronStackProps) {
    super(scope, id, props);

    const {
      stage,
      neonDatabaseUrl,
      twitchClientId,
      twitchClientSecret,
      triggerSecretKey,
      contentImagesBucket,
    } = props;

    const commonProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(5),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_MONTH,
    };

    const pollTwitchStreamsFn = new nodejs.NodejsFunction(
      this,
      'PollTwitchStreamsFunction',
      {
        ...commonProps,
        functionName: `BombasticPollTwitchStreams-${stage}`,
        description:
          'Polls Twitch for active streams (was pg_cron, every minute)',
        entry: path.join(__dirname, '../lambda/poll-twitch-streams.ts'),
        handler: 'handler',
        environment: {
          NEON_DATABASE_URL: neonDatabaseUrl,
          TWITCH_CLIENT_ID: twitchClientId,
          TWITCH_CLIENT_SECRET: twitchClientSecret,
        },
      }
    );

    const processImagesFn = new nodejs.NodejsFunction(
      this,
      'ProcessImagesFunction',
      {
        ...commonProps,
        functionName: `BombasticProcessImages-${stage}`,
        description:
          'Image-processing queue orchestrator (was pg_cron, every minute)',
        entry: path.join(__dirname, '../lambda/process-images.ts'),
        handler: 'handler',
        environment: {
          NEON_DATABASE_URL: neonDatabaseUrl,
          TRIGGER_SECRET_KEY: triggerSecretKey,
          CONTENT_IMAGES_BUCKET: contentImagesBucket,
        },
      }
    );

    const cleanupPlaylistsFn = new nodejs.NodejsFunction(
      this,
      'CleanupPlaylistsFunction',
      {
        ...commonProps,
        functionName: `BombasticCleanupPlaylists-${stage}`,
        description: 'Cleans up soft-deleted playlists (was pg_cron, hourly)',
        entry: path.join(__dirname, '../lambda/cleanup-playlists.ts'),
        handler: 'handler',
        environment: { NEON_DATABASE_URL: neonDatabaseUrl },
      }
    );

    const cleanupNotificationsFn = new nodejs.NodejsFunction(
      this,
      'CleanupNotificationsFunction',
      {
        ...commonProps,
        functionName: `BombasticCleanupNotifications-${stage}`,
        description:
          'Deletes expired notifications (was pg_cron, daily 2am UTC)',
        entry: path.join(__dirname, '../lambda/cleanup-notifications.ts'),
        handler: 'handler',
        environment: { NEON_DATABASE_URL: neonDatabaseUrl },
      }
    );

    new events.Rule(this, 'PollTwitchStreamsRule', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(pollTwitchStreamsFn)],
    });

    new events.Rule(this, 'ProcessImagesRule', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(processImagesFn)],
    });

    new events.Rule(this, 'CleanupPlaylistsRule', {
      schedule: events.Schedule.expression('cron(0 * * * ? *)'),
      targets: [new targets.LambdaFunction(cleanupPlaylistsFn)],
    });

    new events.Rule(this, 'CleanupNotificationsRule', {
      schedule: events.Schedule.expression('cron(0 2 * * ? *)'),
      targets: [new targets.LambdaFunction(cleanupNotificationsFn)],
    });

    for (const [name, fn] of [
      ['PollTwitchStreams', pollTwitchStreamsFn],
      ['ProcessImages', processImagesFn],
      ['CleanupPlaylists', cleanupPlaylistsFn],
      ['CleanupNotifications', cleanupNotificationsFn],
    ] as const) {
      new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        metric: fn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        actionsEnabled: false,
        alarmDescription: `Alarm if the ${name} Lambda has any errors`,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }
  }
}
