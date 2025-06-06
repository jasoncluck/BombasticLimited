import {
  AttributeValue,
  PutItemCommand,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { youtube_v3 } from "@googleapis/youtube";
import { dynamoDbClient } from "../client";
import { ChannelSource } from "../../channel";
import { Video } from "../../../../src/lib/types/video";

interface PutVideoParams {
  tableName: string;
  source: ChannelSource;
  item: youtube_v3.Schema$PlaylistItem;
}
export const putVideo = async ({ tableName, source, item }: PutVideoParams) => {
  if (!item.contentDetails?.videoId) {
    throw new Error("Video ID was not found, unable to store video.");
  }

  if (item.contentDetails?.videoId && item.snippet?.title) {
    try {
      await dynamoDbClient.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            videoId: { S: item.contentDetails?.videoId },
            source: { S: source },
            title: { S: item.snippet?.title },
            type: { S: "video" },
            ...(item.snippet.publishedAt && {
              publishedAt: { S: item.snippet?.publishedAt },
            }),
            ...(item.snippet.thumbnails?.maxres?.url && {
              thumbnailMaxResUrl: {
                S: item.snippet.thumbnails.maxres?.url,
              },
            }),
            ...(item.snippet.thumbnails?.default?.url && {
              thumbnailUrl: { S: item.snippet.thumbnails.default?.url },
            }),
            ...(item.snippet.description && {
              description: { S: item.snippet.description },
            }),
          },
        }),
      );
      console.log(`Stored new video from ${source}: ${item.snippet.title}`);
    } catch (e) {
      console.error(
        `Unable to add video to ${source} with ID: ${item.contentDetails.videoId} and title: ${item.snippet.title}`,
        e,
      );
    }
  }
};

interface GetVideosParams {
  tableName: string;
  type: "video" | "podcast";
  source: ChannelSource;
  limit?: number;
  exclusiveStartKey?: Record<string, AttributeValue>;

  query?: string;
}

export async function queryTableContent({
  tableName,
  source,
  limit = 15,
  exclusiveStartKey,
}: GetVideosParams): Promise<{
  items: Video[];
  lastEvaluatedKey?: Record<string, AttributeValue>;
}> {
  try {
    const params = {
      TableName: tableName,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: {
        "#pk": "source",
      },
      ExpressionAttributeValues: {
        ":pk": { S: source },
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    };

    const command = new QueryCommand(params);
    const data: QueryCommandOutput = await dynamoDbClient.send(command);

    const items = data.Items?.map((item) => ({
      source: item.source.S,
      publishedAt: item.publishedAt.S,
      description: item.description.S,
      thumbnailMaxResUrl: item.thumbnailMaxResUrl.S,
      thumbnailUrl: item.thumbnailUrl.S,
      title: item.title.S,
      videoId: item.videoId.S,
      tags: item.tags?.SS ?? [],
    })) as Video[];

    return {
      items,
      lastEvaluatedKey: data.LastEvaluatedKey,
    };
  } catch (error) {
    console.error("Error querying DynamoDB:", error);
    throw error;
  }
}

export async function searchTableContent({
  tableName,
  type = "video",
  source,
  limit = 15,
  exclusiveStartKey,
}: GetVideosParams): Promise<{
  items: Video[];
  lastEvaluatedKey?: Record<string, AttributeValue>;
}> {
  console.log(`Searching source: ${source}`);

  try {
    const params: QueryCommandInput = {
      TableName: tableName,
      FilterExpression: "#type = :type AND #source = :source",
      ExpressionAttributeNames: {
        "#type": "type",
        "#source": "source",
      },
      ExpressionAttributeValues: {
        ":type": { S: type },
        ":source": { S: source },
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    };

    const command = new ScanCommand(params);
    const data: ScanCommandOutput = await dynamoDbClient.send(command);

    const items = data.Items?.map((item) => ({
      source: item.source.S,
      publishedAt: item.publishedAt.S,
      description: item.description.S,
      thumbnailMaxResUrl: item.thumbnailMaxResUrl.S,
      thumbnailUrl: item.thumbnailUrl.S,
      title: item.title.S,
      videoId: item.videoId.S,
      tags: item.tags?.SS ?? [],
    })) as Video[];

    return {
      items,
      lastEvaluatedKey: data.LastEvaluatedKey,
    };
  } catch (error) {
    console.error("Error querying DynamoDB:", error);
    throw error;
  }
}
