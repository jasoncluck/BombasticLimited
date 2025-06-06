import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as path from "path";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { CHANNEL_SOURCES } from "../channel";

export class VideoStack extends Stack {
  readonly api: RestApi;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    if (!process.env.GOOGLE_API_KEY) {
      throw new Error("Missing Google API key from environment.");
    }

    if (
      !process.env.SUPABASE_SERVICE_API_KEY_PROD ||
      !process.env.PUBLIC_SUPABASE_URL_PROD
    ) {
      throw new Error("Could not find Supabase env.");
    }

    // Lambda to populate the database with the current videos.
    const populateVideosLambda = new nodejs.NodejsFunction(
      this,
      "BombifyPopulateVideos",
      {
        functionName: "BombifyPopulateVideos",
        description: "Populates a table with videos using the YouTube API",
        entry: path.join(__dirname, "../lambda/populate-videos.ts"),
        handler: "populateVideos",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.minutes(15),
        environment: {
          GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
          SUPABASE_SERVICE_API_KEY_PROD:
            process.env.SUPABASE_SERVICE_API_KEY_PROD,
          PUBLIC_SUPABASE_URL_PROD: process.env.PUBLIC_SUPABASE_URL_PROD,
        },
      },
    );

    for (const source of CHANNEL_SOURCES) {
      // Schedule the lambda to run daily and every 30 minutes
      const sourceRule = new events.Rule(this, `${source}_Rule`, {
        schedule: events.Schedule.expression("cron(0,30 * * * ? *)"),
      });

      sourceRule.addTarget(
        new targets.LambdaFunction(populateVideosLambda, {
          event: events.RuleTargetInput.fromObject({ source }),
        }),
      );
    }
  }
}
