import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VideoStack } from './video-stack';
import { BackupStack } from './backup-stack';

interface AppStackProps extends cdk.StackProps {
  environment: 'production' | 'staging';
  environmentVariables: {
    GOOGLE_API_KEY?: string;
    PUBLIC_SUPABASE_URL?: string;
    SUPABASE_SERVICE_API_KEY?: string;
    SUPABASE_DB_URL?: string;
  };
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { environment, environmentVariables } = props;

    new VideoStack(this, 'VideoStack', {
      stackName: `VideoStack-${environment}`,
      environment,
      environmentVariables,
    });

    new BackupStack(this, 'BackupStack', {
      stackName: `BackupStack-${environment}`,
      environment,
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
    });

    new cdk.CfnOutput(this, 'Environment', {
      value: environment,
    });

    new cdk.CfnOutput(this, 'StackName', {
      value: this.stackName,
    });
  }
}
