import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Handler,
} from "aws-lambda";
import { Client } from "@opensearch-project/opensearch";
import { ChannelSource } from "../channel";

const opensearchClient = new Client({
  node: `https://${process.env.OPENSEARCH_ENDPOINT}`,
});

/**
 * Lambda handler for searching content such as videos and podcasts
 */

interface SearchContentEvent extends APIGatewayProxyEvent {
  queryStringParameters: {
    query: string;
    source: ChannelSource;
    nextToken?: string;
    maxResults?: string;
  };
}
export const searchContent: Handler<
  SearchContentEvent,
  APIGatewayProxyResult
> = async (event) => {
  const tableName = process.env.TABLE_NAME;
  const opensearchEndpoint = `https://${process.env.OPENSEARCH_ENDPOINT}`;

  if (!tableName) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Could not find DynamoDB table name, unable to search content.",
      }),
    };
  }

  if (!opensearchEndpoint) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Could not find Opensearch Endpoint, unable to search content.",
      }),
    };
  }

  const { query, source, nextToken, maxResults } =
    event.queryStringParameters || {};
  const limit = maxResults ? parseInt(maxResults, 10) : 15;

  try {
    // Perform search query to OpenSearch
    const searchParams = {
      index: tableName,
      body: {
        query: {
          bool: {
            must: [
              {
                match: {
                  content: query,
                },
              },
              {
                match: {
                  source: source,
                },
              },
            ],
          },
        },
        size: limit,
        from: nextToken ? parseInt(nextToken, 10) : 0,
      },
    };

    const response = await opensearchClient.search(searchParams);

    // Extract hits from response
    const hits = response.body.hits.hits;

    return {
      statusCode: 200,
      body: JSON.stringify({
        results: hits.map((hit) => hit._source),
        nextToken:
          hits.length === limit ? parseInt(nextToken || "0", 10) + limit : null,
      }),
    };
  } catch (error) {
    console.error("Error performing search:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred while performing the search.",
      }),
    };
  }
};
