import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { AdaptiveRetryStrategy } from '@aws-sdk/util-retry';

export const dynamoDbClient = new DynamoDBClient({
  retryStrategy: new AdaptiveRetryStrategy(() => Promise.resolve(10)),
});
