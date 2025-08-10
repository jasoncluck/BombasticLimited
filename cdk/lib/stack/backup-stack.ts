import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  CfnOutput,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export interface BackupStackProps extends StackProps {
  stage?: string;
}

export class BackupStack extends Stack {
  readonly backupBucket: s3.Bucket;
  readonly backupRole: iam.Role;

  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, props);

    const stage = props.stage || 'prod';
    const bucketName = `bombastic-database-backups-${stage}`;

    // S3 Bucket for database backups
    this.backupBucket = new s3.Bucket(this, 'DatabaseBackupBucket', {
      bucketName: bucketName,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'BackupRetention',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(365),
            },
          ],
          expiration:
            stage === 'staging' ? Duration.days(90) : Duration.days(2555), // ~7 years for production
        },
        {
          id: 'NonCurrentVersionCleanup',
          enabled: true,
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
          noncurrentVersionExpiration: Duration.days(365),
        },
      ],
      removalPolicy:
        stage === 'staging' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    // IAM Role for database backup operations
    this.backupRole = new iam.Role(this, 'DatabaseBackupRole', {
      roleName: `bombastic-database-backup-role-${stage}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
      inlinePolicies: {
        DatabaseBackupPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:PutObject',
                's3:PutObjectAcl',
                's3:GetObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                this.backupBucket.bucketArn,
                `${this.backupBucket.bucketArn}/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: ['arn:aws:logs:*:*:*'],
            }),
          ],
        }),
      },
    });

    // Lambda function for database backup
    const backupLambda = new nodejs.NodejsFunction(
      this,
      'DatabaseBackupFunction',
      {
        functionName: `BombasticDatabaseBackup-${stage}`,
        description: 'Performs database backups to S3',
        entry: path.join(__dirname, '../lambda/database-backup.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.minutes(15),
        memorySize: 512,
        role: this.backupRole,
        environment: {
          BACKUP_BUCKET_NAME: this.backupBucket.bucketName,
          ENVIRONMENT: stage,
          SUPABASE_SERVICE_API_KEY_PROD:
            process.env.SUPABASE_SERVICE_API_KEY_PROD ?? '',
          PUBLIC_SUPABASE_URL_PROD: process.env.PUBLIC_SUPABASE_URL_PROD ?? '',
          SUPABASE_DB_URL_PROD: process.env.SUPABASE_DB_URL_PROD ?? '',
        },
        logRetention: logs.RetentionDays.ONE_MONTH,
      }
    );

    // Lambda function for database restore/disaster recovery
    const restoreLambda = new nodejs.NodejsFunction(
      this,
      'DatabaseRestoreFunction',
      {
        functionName: `BombasticDatabaseRestore-${stage}`,
        description:
          'Performs database restore operations from S3 backups for disaster recovery',
        entry: path.join(__dirname, '../lambda/database-restore.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.minutes(15),
        memorySize: 1024, // More memory for processing large backups
        role: this.backupRole,
        environment: {
          BACKUP_BUCKET_NAME: this.backupBucket.bucketName,
          ENVIRONMENT: stage,
          SUPABASE_SERVICE_API_KEY_PROD:
            process.env.SUPABASE_SERVICE_API_KEY_PROD || '',
          PUBLIC_SUPABASE_URL_PROD: process.env.PUBLIC_SUPABASE_URL_PROD || '',
          SUPABASE_DB_URL_PROD: process.env.SUPABASE_DB_URL_PROD ?? '',
        },
        logRetention: logs.RetentionDays.ONE_MONTH,
      }
    );

    // CloudWatch Alarm for backup failures
    const backupErrorAlarm = new cloudwatch.Alarm(
      this,
      'BackupLambdaErrorAlarm',
      {
        metric: backupLambda.metricErrors({
          period: Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        actionsEnabled: false,
        alarmDescription: 'Alarm if the database backup Lambda has any errors',
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    // CloudWatch Alarm for restore failures
    const restoreErrorAlarm = new cloudwatch.Alarm(
      this,
      'RestoreLambdaErrorAlarm',
      {
        metric: restoreLambda.metricErrors({
          period: Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        actionsEnabled: false,
        alarmDescription: 'Alarm if the database restore Lambda has any errors',
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    // Schedule daily backups at 2 AM UTC
    const backupRule = new events.Rule(this, 'DailyBackupRule', {
      schedule: events.Schedule.expression('cron(0 2 * * ? *)'),
      description: 'Trigger daily database backup',
    });

    backupRule.addTarget(new targets.LambdaFunction(backupLambda));

    // CloudWatch Dashboard for backup monitoring
    const dashboard = new cloudwatch.Dashboard(this, 'BackupDashboard', {
      dashboardName: `BombasticBackups-${stage}`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Backup Lambda Invocations',
        left: [backupLambda.metricInvocations()],
        right: [backupLambda.metricErrors()],
      }),
      new cloudwatch.GraphWidget({
        title: 'Backup Lambda Duration',
        left: [backupLambda.metricDuration()],
      }),
      new cloudwatch.GraphWidget({
        title: 'Restore Lambda Invocations',
        left: [restoreLambda.metricInvocations()],
        right: [restoreLambda.metricErrors()],
      }),
      new cloudwatch.GraphWidget({
        title: 'Restore Lambda Duration',
        left: [restoreLambda.metricDuration()],
      })
    );

    // Outputs
    new CfnOutput(this, 'BackupBucketName', {
      value: this.backupBucket.bucketName,
      description: 'Name of the S3 bucket for database backups',
    });

    new CfnOutput(this, 'BackupRoleArn', {
      value: this.backupRole.roleArn,
      description: 'ARN of the IAM role for backup operations',
    });

    new CfnOutput(this, 'BackupLambdaArn', {
      value: backupLambda.functionArn,
      description: 'ARN of the backup Lambda function',
    });

    new CfnOutput(this, 'RestoreLambdaArn', {
      value: restoreLambda.functionArn,
      description: 'ARN of the restore Lambda function for disaster recovery',
    });
  }
}
