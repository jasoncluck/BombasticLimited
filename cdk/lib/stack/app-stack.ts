import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { VideoStack } from "./video-stack";
import { BackupStack } from "./backup-stack";

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = process.env.ENVIRONMENT || "prod";

    new VideoStack(this, "VideoStack", {
      stackName: "VideoStack",
    });

    new BackupStack(this, "BackupStack", {
      stackName: "BackupStack",
      environment,
    });

    new cdk.CfnOutput(this, "Region", {
      value: this.region,
    });

    new cdk.CfnOutput(this, "Environment", {
      value: environment,
    });
  }
}
