import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { VideoStack } from "./video-stack";

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new VideoStack(this, "VideoStack", {
      stackName: "VideoStack",
    });

    new cdk.CfnOutput(this, "Region", {
      value: this.region,
    });
  }
}
