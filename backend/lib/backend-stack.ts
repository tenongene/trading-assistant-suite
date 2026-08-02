import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "path";

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "TradingLogsTable", {
      tableName: "TradingLogs",
      partitionKey: { name: "date", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const makeFn = (id: string, entry: string) =>
      new lambdaNode.NodejsFunction(this, id, {
        entry: path.join(__dirname, "..", "lambda", entry),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: Duration.seconds(10),
        environment: { TABLE_NAME: table.tableName },
        bundling: { minify: true },
      });

    const createFn = makeFn("CreateLogFn", "create.ts");
    const getFn = makeFn("GetLogFn", "get.ts");
    const updateFn = makeFn("UpdateLogFn", "update.ts");
    const deleteFn = makeFn("DeleteLogFn", "delete.ts");
    const listFn = makeFn("ListLogsFn", "list.ts");

    // Least-privilege: each function only gets the single DynamoDB action its handler uses.
    table.grant(createFn, "dynamodb:PutItem");
    table.grant(getFn, "dynamodb:GetItem");
    table.grant(updateFn, "dynamodb:PutItem");
    table.grant(deleteFn, "dynamodb:DeleteItem");
    table.grant(listFn, "dynamodb:Scan");

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

    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
  }
}
