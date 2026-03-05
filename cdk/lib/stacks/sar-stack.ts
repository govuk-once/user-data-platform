import { Stack, StackProps } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { LambdaApiConstruct } from '../constructs/lambda-construct';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Function } from 'aws-cdk-lib/aws-lambda';

export interface SarStackProps extends StackProps {
  developerId?: string;
  environment: string;
  stackPrefix: string;
  table: Table;
  identityTable: Table;
  kmsKey: IKey;
  dbKmsKey: IKey;
  dsarQueue: Queue;
  vpc?: IVpc;
  lambdaSecurityGroups?: ISecurityGroup;
}

export class SarStack extends Stack {
  public readonly lambdas: Function[] = [];

  constructor(scope: Construct, id: string, props: SarStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      stackPrefix,
      table,
      identityTable,
      kmsKey,
      dbKmsKey,
      dsarQueue,
      vpc,
      lambdaSecurityGroups,
    } = props;

    const sarName = developerId
      ? `${developerId}-sar-${environment}`
      : `sar-${environment}`;

    const dsarDeleteDLQueue = new Queue(this, 'dsarDeleteDLQueue', {
      queueName: `${sarName}-delete-dl-queue`,
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: kmsKey,
    });

    const dsarDeleteQueue = new Queue(this, 'dsarDeleteQueue', {
      queueName: `${sarName}-delete-queue`,
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: kmsKey,
      deadLetterQueue: {
        queue: dsarDeleteDLQueue,
        maxReceiveCount: 3,
      },
    });

    const dsarRequestLambda = new LambdaApiConstruct(this, 'dsarRequest', {
      developerId,
      environment,
      functionName: 'dsarRequestLambda',
      sourcePath: 'dsarRequestLambda',
      kmsKey,
      dbKmsKey,
      dynamoDBtable: table,
      dynamoDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
      identityDbTable: identityTable,
      identityDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
      sqsQueueUrl: dsarDeleteQueue.queueUrl,
      sqsQueueArn: dsarDeleteQueue.queueArn,
      environmentVariables: {
        STACK: stackPrefix,
        SERVICE_NAME: 'dsarRequest',
      },
      vpc,
      securityGroups: lambdaSecurityGroups ? [lambdaSecurityGroups] : [],
    });

    dsarRequestLambda.function.addEventSource(
      new SqsEventSource(dsarQueue, { batchSize: 1 }),
    );

    this.lambdas.push(dsarRequestLambda.function);

    const dsarDeleteLambda = new LambdaApiConstruct(this, 'dsarDelete', {
      developerId,
      environment,
      functionName: 'dsarDeleteLambda',
      sourcePath: 'dsarDeleteLambda',
      kmsKey,
      dbKmsKey,
      dynamoDBtable: table,
      dynamoDbActions: ['dynamodb:DeleteItem'],
      identityDbTable: identityTable,
      identityDbActions: [
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:GetItem',
      ],
      environmentVariables: {
        STACK: stackPrefix,
        SERVICE_NAME: 'dsarRequest',
      },
      vpc,
      securityGroups: lambdaSecurityGroups ? [lambdaSecurityGroups] : [],
    });

    dsarDeleteLambda.function.addEventSource(
      new SqsEventSource(dsarDeleteQueue, { batchSize: 1 }),
    );

    this.lambdas.push(dsarDeleteLambda.function);
  }
}
