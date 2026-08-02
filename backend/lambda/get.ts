import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const date = event.pathParameters?.date;
  if (!date) {
    return { statusCode: 400, body: JSON.stringify({ message: "date path parameter is required" }) };
  }

  const result = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { date } }));

  if (!result.Item) {
    return { statusCode: 404, body: JSON.stringify({ message: `No log found for ${date}` }) };
  }

  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
