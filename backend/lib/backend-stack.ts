import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

// Holds the Anthropic API key; created out-of-band via `aws ssm put-parameter` so the
// secret value itself never appears in this stack or CloudFormation template.
const ANTHROPIC_API_KEY_PARAM = "/chart-observation-log/anthropic-api-key";

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "TradingLogsTable", {
      tableName: "TradingLogs",
      partitionKey: { name: "date", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const pnlTable = new dynamodb.Table(this, "PnlEntriesTable", {
      tableName: "PnlEntries",
      partitionKey: { name: "date", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const makeFn = (id: string, lambdaDir: string, entry: string, tableName: string) =>
      new lambdaNode.NodejsFunction(this, id, {
        entry: path.join(__dirname, "..", "lambda", lambdaDir, entry),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: Duration.seconds(10),
        environment: { TABLE_NAME: tableName },
        bundling: { minify: true },
      });

    const createFn = makeFn("CreateLogFn", ".", "create.ts", table.tableName);
    const getFn = makeFn("GetLogFn", ".", "get.ts", table.tableName);
    const updateFn = makeFn("UpdateLogFn", ".", "update.ts", table.tableName);
    const deleteFn = makeFn("DeleteLogFn", ".", "delete.ts", table.tableName);
    const listFn = makeFn("ListLogsFn", ".", "list.ts", table.tableName);

    // Least-privilege: each function only gets the single DynamoDB action its handler uses.
    table.grant(createFn, "dynamodb:PutItem");
    table.grant(getFn, "dynamodb:GetItem");
    table.grant(updateFn, "dynamodb:PutItem");
    table.grant(deleteFn, "dynamodb:DeleteItem");
    table.grant(listFn, "dynamodb:Scan");

    const createPnlFn = makeFn("CreatePnlFn", "pnl", "create.ts", pnlTable.tableName);
    const getPnlFn = makeFn("GetPnlFn", "pnl", "get.ts", pnlTable.tableName);
    const updatePnlFn = makeFn("UpdatePnlFn", "pnl", "update.ts", pnlTable.tableName);
    const deletePnlFn = makeFn("DeletePnlFn", "pnl", "delete.ts", pnlTable.tableName);
    const listPnlFn = makeFn("ListPnlFn", "pnl", "list.ts", pnlTable.tableName);

    pnlTable.grant(createPnlFn, "dynamodb:PutItem");
    pnlTable.grant(getPnlFn, "dynamodb:GetItem");
    pnlTable.grant(updatePnlFn, "dynamodb:PutItem");
    pnlTable.grant(deletePnlFn, "dynamodb:DeleteItem");
    pnlTable.grant(listPnlFn, "dynamodb:Scan");

    const recsTable = new dynamodb.Table(this, "TradingRecommendationsTable", {
      tableName: "TradingRecommendations",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const getRecommendationFn = makeFn("GetRecommendationFn", "recommendations", "get.ts", recsTable.tableName);
    recsTable.grant(getRecommendationFn, "dynamodb:GetItem");

    const apiKeyParamArn = `arn:aws:ssm:${this.region}:${this.account}:parameter${ANTHROPIC_API_KEY_PARAM}`;

    const generateRecommendationFn = new lambdaNode.NodejsFunction(this, "GenerateRecommendationFn", {
      entry: path.join(__dirname, "..", "lambda", "recommendations", "generate.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      // Capped at the API Gateway HTTP API integration's hard 29s timeout, so the
      // function fails cleanly instead of running past what the client will ever see.
      timeout: Duration.seconds(29),
      environment: {
        LOGS_TABLE_NAME: table.tableName,
        RECS_TABLE_NAME: recsTable.tableName,
        API_KEY_PARAM_NAME: ANTHROPIC_API_KEY_PARAM,
      },
      bundling: { minify: true },
    });

    table.grant(generateRecommendationFn, "dynamodb:Scan");
    recsTable.grant(generateRecommendationFn, "dynamodb:PutItem");
    generateRecommendationFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [apiKeyParamArn],
    }));
    generateRecommendationFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["kms:Decrypt"],
      resources: [`arn:aws:kms:${this.region}:${this.account}:alias/aws/ssm`],
    }));

    const httpApi = new apigwv2.HttpApi(this, "TradingLogsApi", {
      apiName: "trading-logs-api",
      corsPreflight: {
        // Tighten allowOrigins to the Amplify app URL once it's known.
        allowOrigins: ["*"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowHeaders: ["Content-Type"],
      },
    });

    httpApi.addRoutes({
      path: "/logs",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("CreateIntegration", createFn),
    });
    httpApi.addRoutes({
      path: "/logs",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ListIntegration", listFn),
    });
    httpApi.addRoutes({
      path: "/logs/{date}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("GetIntegration", getFn),
    });
    httpApi.addRoutes({
      path: "/logs/{date}",
      methods: [apigwv2.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration("UpdateIntegration", updateFn),
    });
    httpApi.addRoutes({
      path: "/logs/{date}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("DeleteIntegration", deleteFn),
    });

    httpApi.addRoutes({
      path: "/pnl-entries",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("CreatePnlIntegration", createPnlFn),
    });
    httpApi.addRoutes({
      path: "/pnl-entries",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ListPnlIntegration", listPnlFn),
    });
    httpApi.addRoutes({
      path: "/pnl-entries/{date}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("GetPnlIntegration", getPnlFn),
    });
    httpApi.addRoutes({
      path: "/pnl-entries/{date}",
      methods: [apigwv2.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration("UpdatePnlIntegration", updatePnlFn),
    });
    httpApi.addRoutes({
      path: "/pnl-entries/{date}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("DeletePnlIntegration", deletePnlFn),
    });

    httpApi.addRoutes({
      path: "/recommendations",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("GetRecommendationIntegration", getRecommendationFn),
    });
    httpApi.addRoutes({
      path: "/recommendations/generate",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("GenerateRecommendationIntegration", generateRecommendationFn),
    });

    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
  }
}
