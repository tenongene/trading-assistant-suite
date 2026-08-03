import { APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  const result = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: "latest" } }));

  if (!result.Item) {
    return { statusCode: 404, body: JSON.stringify({ message: "No recommendation generated yet" }) };
  }

  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
