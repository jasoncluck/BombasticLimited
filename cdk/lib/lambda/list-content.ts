import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Handler,
} from "aws-lambda";
import { queryTableContent } from "./video/dynamodb";
import {
  decodePaginationToken,
  encodePaginationToken,
} from "../util/pagination";
import { addCorsHeaders } from "./cors";
import { Source } from "../../../shared/source";

/**
 * Lambda handler for listing out stored videos
 */

interface ListContentEvent extends APIGatewayProxyEvent {
  queryStringParameters: {
    query: string;
    source: Source;
    nextToken?: string;
    maxResults?: string;
  };
}
export const listContent: Handler<
  ListContentEvent,
  APIGatewayProxyResult
> = async (event) => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Could not find DynamoDB table name, unable to retrieve videos.",
      }),
    };
  }

  const { type, source, nextToken, maxResults } = event.queryStringParameters;
  const limit = maxResults ? parseInt(maxResults, 10) : 15;

  if (!source) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing source in query string parameters.",
      }),
    };
  }

  try {
    const { items, lastEvaluatedKey } = await queryTableContent({
      tableName,
      // TODO: Update as needed
      type: "video",
      source,
      exclusiveStartKey: nextToken
        ? decodePaginationToken(nextToken)
        : undefined,
      limit,
    });

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        items,
        nextToken: lastEvaluatedKey
          ? encodePaginationToken(lastEvaluatedKey)
          : null,
      }),
    });
  } catch (error) {
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    });
  }
};
