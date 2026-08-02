#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";

const app = new App();
new BackendStack(app, "ChartObservationLogBackendStack");
