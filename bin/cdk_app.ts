#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkAppStack } from '../lib/cdk_app-stack';
import { Parameters } from '../parameters';

const app = new cdk.App();
new CdkAppStack(app, 'CdkAppStack', {
    env: { region: Parameters.aws_region }
});
