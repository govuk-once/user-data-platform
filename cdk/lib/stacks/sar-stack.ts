import { Stack, StackProps } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { LambdaApiConstruct } from '../constructs/lambda-construct';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { S3Construct } from '../constructs/s3-construct';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';

export interface SarStackProps extends StackProps {
  developerId?: string;
  environment: string;
  stackPrefix: string;
  table: Table;
  identityTable: Table;
  kmsKey: IKey;
  dbKmsKey: IKey;
  dsarQueue: Queue;
  sarQueue: Queue;
  vpc?: IVpc;
  lambdaSecurityGroups?: ISecurityGroup;
}

export class SarStack extends Stack {
  public readonly lambdas: Function[] = [];
  public readonly sarBucket: Bucket;

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
      sarQueue,
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

    // SAR File Creation Infrastructure
    const sarDLQueue = new Queue(this, 'sarDLQueue', {
      queueName: `${sarName}-file-dl-queue`,
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: kmsKey,
    });

    // Create S3 bucket for SAR files
    const sarBucketConstruct = new S3Construct(this, 'sarBucket', {
      developerId,
      environment,
      bucketName: 'govuk-udp-sar-bucket',
      kmsKey,
      vpcId: vpc?.vpcId,
    });

    this.sarBucket = sarBucketConstruct.bucket;

    // Create SAR file lambda
    const createSarFileLambda = new LambdaApiConstruct(this, 'createSarFile', {
      developerId,
      environment,
      functionName: 'createSarFileLambda',
      sourcePath: 'createSarFileLambda',
      kmsKey,
      dbKmsKey,
      dynamoDBtable: table,
      dynamoDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
      identityDbTable: identityTable,
      identityDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
      sqsQueueUrl: sarDLQueue.queueUrl,
      sqsQueueArn: sarDLQueue.queueArn,
      environmentVariables: {
        STACK: stackPrefix,
        SERVICE_NAME: 'createSarFile',
        BUCKET_NAME: this.sarBucket.bucketName,
        DLQ_URL: sarDLQueue.queueUrl,
      },
      vpc,
      securityGroups: lambdaSecurityGroups ? [lambdaSecurityGroups] : [],
    });

    // Add sarQueue as event source for createSarFile lambda
    createSarFileLambda.function.addEventSource(
      new SqsEventSource(sarQueue, { batchSize: 1 }),
    );

    // Grant S3 write permissions to the lambda
    this.sarBucket.grantWrite(createSarFileLambda.function);

    // Grant DLQ send message permissions
    sarDLQueue.grantSendMessages(createSarFileLambda.function);

    this.lambdas.push(createSarFileLambda.function);

    // Create Generate SAR Pre-signed URL lambda
    const generateSarPresignedUrlLambda = new LambdaApiConstruct(
      this,
      'generateSarPresignedUrl',
      {
        developerId,
        environment,
        functionName: 'generateSarPresignedUrlLambda',
        sourcePath: 'generateSarPresignedUrlLambda',
        kmsKey,
        dbKmsKey,
        dynamoDBtable: table,
        dynamoDbActions: ['dynamodb:PutItem'],
        environmentVariables: {
          STACK: stackPrefix,
          SERVICE_NAME: 'generateSarPresignedUrl',
        },
        vpc,
        securityGroups: lambdaSecurityGroups ? [lambdaSecurityGroups] : [],
      },
    );

    // Grant S3 read permissions to the lambda
    this.sarBucket.grantRead(generateSarPresignedUrlLambda.function);

    // Add S3 event notification for object created events
    this.sarBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(generateSarPresignedUrlLambda.function),
    );

    this.lambdas.push(generateSarPresignedUrlLambda.function);
  }
}
