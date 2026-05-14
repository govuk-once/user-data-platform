#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { SAMLocalTestStack } from './SAMLocalTestStack';

const app = new App();
new SAMLocalTestStack(app, 'SAMLocalTestStack');
app.synth();
