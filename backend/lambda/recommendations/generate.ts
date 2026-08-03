import { APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

const LOGS_TABLE_NAME = process.env.LOGS_TABLE_NAME!;
const RECS_TABLE_NAME = process.env.RECS_TABLE_NAME!;
const API_KEY_PARAM_NAME = process.env.API_KEY_PARAM_NAME!;

const SYSTEM_PROMPT = `You are an expert trading coach, well-versed in the methodologies of successful professional and institutional traders: disciplined risk management, statistical edge, ICT/SMC concepts, session classification, and rigorous journaling.

You will be given a trader's chart observation log for their last 30 logged days, including session context, volume profile levels, individual trades, and their own notes/lessons.

Analyze the data for concrete patterns: which signals or setups actually work for this trader, where their session classification is inaccurate, recurring mistakes in their notes and lessons, risk-management issues (R:R, stop placement), and how quality grade correlates with outcome.

Respond with concise, specific, actionable recommendations grounded in what is actually in the data — not generic trading advice. Reference actual figures or patterns you found. Structure the response as a few short headed sections with 2-4 bullet points each. Keep the total response under 500 words.`;

let cachedApiKey: string | undefined;
async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const result = await ssm.send(
    new GetParameterCommand({ Name: API_KEY_PARAM_NAME, WithDecryption: true })
  );
  cachedApiKey = result.Parameter!.Value!;
  return cachedApiKey;
}

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchLast30Days(): Promise<Record<string, unknown>[]> {
  const items: Record<string, any>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(new ScanCommand({ TableName: LOGS_TABLE_NAME, ExclusiveStartKey }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffStr = fmtDate(cutoff);

  return items
    .filter((item) => item.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ trades, ...rest }) => ({
      ...rest,
      trades: (trades ?? []).map(({ id, ...tradeRest }: any) => tradeRest),
    }));
}

export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  const days = await fetchLast30Days();

  if (days.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "No trading log data in the last 30 days to analyze." }),
    };
  }

  const apiKey = await getApiKey();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(days) }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Anthropic API error", response.status, errText);
    return { statusCode: 502, body: JSON.stringify({ message: "Failed to generate recommendation" }) };
  }

  const data: any = await response.json();
  const text = (data.content ?? [])
    .map((block: any) => block.text ?? "")
    .join("\n")
    .trim();

  const record = {
    id: "latest",
    text,
    generatedAt: new Date().toISOString(),
    daysAnalyzed: days.length,
  };

  await ddb.send(new PutCommand({ TableName: RECS_TABLE_NAME, Item: record }));

  return { statusCode: 200, body: JSON.stringify(record) };
};
