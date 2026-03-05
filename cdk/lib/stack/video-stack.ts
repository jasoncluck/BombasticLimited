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

interface VideoStackProps extends StackProps {
  stage: 'Production' | 'Staging';
  environmentVariables: {
    GOOGLE_API_KEY?: string;
    PUBLIC_SUPABASE_URL?: string;
    SUPABASE_SERVICE_API_KEY?: string;
  };
}

export class VideoStack extends Stack {
  readonly api: RestApi;

  constructor(scope: Construct, id: string, props: VideoStackProps) {
    super(scope, id, props);

    const { stage, environmentVariables } = props;

    // Enable deletion protection for production
    if (stage === 'Production') {
      this.terminationProtection = true;
    }

    // Validate required environment variables
    if (!environmentVariables.GOOGLE_API_KEY) {
      throw new Error(`Missing Google API key for ${stage} environment.`);
    }

    if (
      !environmentVariables.SUPABASE_SERVICE_API_KEY ||
      !environmentVariables.PUBLIC_SUPABASE_URL
    ) {
      throw new Error(
        `Could not find Supabase environment variables for ${stage}.`
      );
    }

    // Create environment-specific function names
    const functionNameSuffix = stage === 'Production' ? '' : `-${stage}`;

    // Lambda to populate the database with the current videos.
    const populateVideosLambda = new nodejs.NodejsFunction(
      this,
      'BombasticPopulateVideos',
      {
        functionName: `BombasticPopulateVideos${functionNameSuffix}`,
        description: `Populates a table with videos using the YouTube API (${stage})`,
        entry: path.join(__dirname, '../lambda/populate-videos.ts'),
        handler: 'populateVideos',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.minutes(15),
        environment: {
          GOOGLE_API_KEY: environmentVariables.GOOGLE_API_KEY,
          SUPABASE_SERVICE_API_KEY:
            environmentVariables.SUPABASE_SERVICE_API_KEY,
          PUBLIC_SUPABASE_URL: environmentVariables.PUBLIC_SUPABASE_URL,
          ENVIRONMENT: stage,
        },
      }
    );

    // CloudWatch Alarm for Lambda Errors
    const errorAlarm = new cloudwatch.Alarm(
      this,
      'PopulateVideoLambdaErrorAlarm',
      {
        alarmName: `PopulateVideoLambdaErrorAlarm-${stage}`,
        metric: populateVideosLambda.metricErrors({
          period: Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 5,
        actionsEnabled: false,
        datapointsToAlarm: 5,
        alarmDescription: `Alarm if the populate-videos Lambda has any errors in a 5-minute period (${stage})`,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    const populatePlaylistsLambda = new nodejs.NodejsFunction(
      this,
      'BombasticPopulatePlaylists',
      {
        functionName: `BombasticPopulatePlaylists${functionNameSuffix}`,
        description: `Populates the playlists table using the YouTube API (${stage})`,
        entry: path.join(__dirname, '../lambda/populate-playlists.ts'),
        handler: 'populatePlaylists',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.minutes(15),
        environment: {
          GOOGLE_API_KEY: environmentVariables.GOOGLE_API_KEY,
          SUPABASE_SERVICE_API_KEY:
            environmentVariables.SUPABASE_SERVICE_API_KEY,
          PUBLIC_SUPABASE_URL: environmentVariables.PUBLIC_SUPABASE_URL,
          ENVIRONMENT: stage,
        },
      }
    );

    // CloudWatch Alarm for Playlists Lambda Errors
    const playlistsErrorAlarm = new cloudwatch.Alarm(
      this,
      'PopulatePlaylistsLambdaErrorAlarm',
      {
        alarmName: `PopulatePlaylistsLambdaErrorAlarm-${stage}`,
        metric: populatePlaylistsLambda.metricErrors({
          period: Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 5,
        actionsEnabled: false,
        datapointsToAlarm: 5,
        alarmDescription: `Alarm if the populate-playlists Lambda has any errors in a 5-minute period (${stage})`,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    // Create environment-specific schedules (different schedules for staging vs production)
    // AWS EventBridge cron format: minute hour day-of-month month day-of-week year
    const videosSchedule =
      stage === 'Production'
        ? 'cron(0,30 * * * ? *)' // Every 30 minutes for production
        : 'cron(0 */2 * * ? *)'; // Every 2 hours for staging

    const playlistsSchedule =
      stage === 'Production'
        ? 'cron(0 12 * * ? *)' // Daily at noon for production
        : 'cron(0 14 ? * 1 *)'; // Weekly on Mondays at 2 PM for staging

    for (const source of CHANNEL_SOURCES) {
      // Schedule the videos lambda
      const videosSourceRule = new events.Rule(this, `${source}_Videos_Rule`, {
        ruleName: `${source}_Videos_Rule_${stage}`,
        schedule: events.Schedule.expression(videosSchedule),
      });

      videosSourceRule.addTarget(
        new targets.LambdaFunction(populateVideosLambda, {
          event: events.RuleTargetInput.fromObject({ source }),
        })
      );

      // Schedule the playlists lambda
      const playlistsSourceRule = new events.Rule(
        this,
        `${source}_Playlists_Rule`,
        {
          ruleName: `${source}_Playlists_Rule_${stage}`,
          schedule: events.Schedule.expression(playlistsSchedule),
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
        stateMachineName: `BombasticRepopulateStateMachine-${stage}`,
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
        functionName: `BombasticTriggerRepopulate${functionNameSuffix}`,
        description: `Triggers the repopulation Step Function (${stage})`,
        entry: path.join(__dirname, '../lambda/trigger-repopulate.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(30),
        environment: {
          STATE_MACHINE_ARN: repopulateStateMachine.stateMachineArn,
          ENVIRONMENT: stage,
        },
      }
    );

    repopulateStateMachine.grantStartExecution(triggerRepopulateLambda);
  }
}
