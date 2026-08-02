import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const date = event.pathParameters?.date;
  if (!date) {
    return { statusCode: 400, body: JSON.stringify({ message: "date path parameter is required" }) };
  }

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { date },
        ConditionExpression: "attribute_exists(#date)",
        ExpressionAttributeNames: { "#date": "date" },
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return { statusCode: 404, body: JSON.stringify({ message: `No log found for ${date}` }) };
    }
    throw err;
  }

  return { statusCode: 204, body: "" };
};
