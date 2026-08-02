import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { PnlEntry } from "./types";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const date = event.pathParameters?.date;
  if (!date) {
    return { statusCode: 400, body: JSON.stringify({ message: "date path parameter is required" }) };
  }
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing request body" }) };
  }

  let entry: PnlEntry;
  try {
    entry = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON" }) };
  }
  entry.date = date;

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: entry,
        ConditionExpression: "attribute_exists(#date)",
        ExpressionAttributeNames: { "#date": "date" },
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return { statusCode: 404, body: JSON.stringify({ message: `No entry found for ${date}` }) };
    }
    throw err;
  }

  return { statusCode: 200, body: JSON.stringify(entry) };
};
