import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as path from 'path';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { CHANNEL_SOURCES } from '../channel';

export class VideoStack extends Stack {
  readonly api: RestApi;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('Missing Google API key from environment.');
    }

    if (
      !process.env.SUPABASE_SERVICE_API_KEY_PROD ||
      !process.env.PUBLIC_SUPABASE_URL_PROD
    ) {
      throw new Error('Could not find Supabase env.');
    }

    // Lambda to populate the database with the current videos.
    const populateVideosLambda = new nodejs.NodejsFunction(
      this,
      'BombasticPopulateVideos',
      {
        functionName: 'BombasticPopulateVideos',
        description: 'Populates a table with videos using the YouTube API',
        entry: path.join(__dirname, '../lambda/populate-videos.ts'),
        handler: 'populateVideos',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.minutes(15),
        environment: {
          GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
          SUPABASE_SERVICE_API_KEY_PROD:
            process.env.SUPABASE_SERVICE_API_KEY_PROD,
          PUBLIC_SUPABASE_URL_PROD: process.env.PUBLIC_SUPABASE_URL_PROD,
        },
      }
    );

    // CloudWatch Alarm for Lambda Errors
    const errorAlarm = new cloudwatch.Alarm(
      this,
      'PopulateVideoLambdaErrorAlarm',
      {
        metric: populateVideosLambda.metricErrors({
          period: Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 5,
        actionsEnabled: false,
        datapointsToAlarm: 5,
        alarmDescription:
          'Alarm if the populate-videos Lambda has any errors in a 5-minute period',
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    const populatePlaylistsLambda = new nodejs.NodejsFunction(
      this,
      'BombasticPopulatePlaylists',
      {
        functionName: 'BombasticPopulatePlaylists',
        description: 'Populates the playlists table using the YouTube API',
        entry: path.join(__dirname, '../lambda/populate-playlists.ts'),
        handler: 'populatePlaylists',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.minutes(15),
        environment: {
          GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
          SUPABASE_SERVICE_API_KEY_PROD:
            process.env.SUPABASE_SERVICE_API_KEY_PROD,
          PUBLIC_SUPABASE_URL_PROD: process.env.PUBLIC_SUPABASE_URL_PROD,
        },
      }
    );

    // CloudWatch Alarm for Playlists Lambda Errors
    const playlistsErrorAlarm = new cloudwatch.Alarm(
      this,
      'PopulatePlaylistsLambdaErrorAlarm',
      {
        metric: populatePlaylistsLambda.metricErrors({
          period: Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 5,
        actionsEnabled: false,
        datapointsToAlarm: 5,
        alarmDescription:
          'Alarm if the populate-playlists Lambda has any errors in a 5-minute period',
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    for (const source of CHANNEL_SOURCES) {
      // Schedule the videos lambda to run every 30 minutes
      const videosSourceRule = new events.Rule(this, `${source}_Videos_Rule`, {
        schedule: events.Schedule.expression('cron(0,30 * * * ? *)'),
      });

      videosSourceRule.addTarget(
        new targets.LambdaFunction(populateVideosLambda, {
          event: events.RuleTargetInput.fromObject({ source }),
        })
      );

      // Schedule the playlists lambda to run every day at noon
      const playlistsSourceRule = new events.Rule(
        this,
        `${source}_Playlists_Rule`,
        {
          schedule: events.Schedule.expression('cron(0 12 * * ? *)'),
        }
      );

      playlistsSourceRule.addTarget(
        new targets.LambdaFunction(populatePlaylistsLambda, {
          event: events.RuleTargetInput.fromObject({ source }),
        })
      );
    }

    const repopulateStateMachine = new stepfunctions.StateMachine(
      this,
      'RepopulateStateMachine',
      {
        stateMachineName: 'BombasticRepopulateStateMachine',
        timeout: Duration.hours(2), // Allow up to 2 hours for full repopulation
        definition: stepfunctions.Chain.start(
          new stepfunctions.Map(this, 'ProcessSources', {
            itemsPath: '$.sources',
            maxConcurrency: 1, // Process one source at a time to avoid overwhelming APIs
          }).iterator(
            new sfnTasks.LambdaInvoke(this, 'RepopulateSource', {
              lambdaFunction: populateVideosLambda,
              payload: stepfunctions.TaskInput.fromObject({
                'source.$': '$',
                repopulate: true,
              }),
              timeout: Duration.minutes(15),
              retryOnServiceExceptions: false,
            })
          )
        ),
      }
    );

    // Create a trigger lambda for the Step Function
    const triggerRepopulateLambda = new nodejs.NodejsFunction(
      this,
      'BombasticTriggerRepopulate',
      {
        functionName: 'BombasticTriggerRepopulate',
        description: 'Triggers the repopulation Step Function',
        entry: path.join(__dirname, '../lambda/trigger-repopulate.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(30),
        environment: {
          STATE_MACHINE_ARN: repopulateStateMachine.stateMachineArn,
        },
      }
    );

    repopulateStateMachine.grantStartExecution(triggerRepopulateLambda);
  }
}
