import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VideoStack } from './video-stack';

interface AppStackProps extends cdk.StackProps {
  stage: 'Production' | 'Staging';
  environmentVariables: {
    GOOGLE_API_KEY?: string;
    NEON_DATABASE_URL?: string;
  };
  cognitoUserPoolId: string;
  cognitoRegion: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { stage, environmentVariables, cognitoUserPoolId, cognitoRegion } =
      props;

    // Enable deletion protection for production
    if (stage === 'Production') {
      this.terminationProtection = true;
    }

    new VideoStack(this, 'VideoStack', {
      stackName: `VideoStack-${stage}`,
      stage,
      environmentVariables,
      cognitoUserPoolId,
      cognitoRegion,
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
    });

    new cdk.CfnOutput(this, 'Environment', {
      value: stage,
    });

    new cdk.CfnOutput(this, 'StackName', {
      value: this.stackName,
    });

    new cdk.CfnOutput(this, 'DeletionProtection', {
      value: stage === 'Production' ? 'ENABLED' : 'DISABLED',
      description: 'Whether deletion protection is enabled for this stack',
    });
  }
}
