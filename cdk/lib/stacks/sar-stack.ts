import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';

import { LambdaApiConstruct } from 'cdk/lib/constructs/lambda-construct';
import { S3Construct } from 'cdk/lib/constructs/s3-construct';
import { getLogRetentionPeriod } from 'cdk/constants/environment';
import { GovUKTag } from '../gov-uk-tag';

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
  deploymentRoleArn?: string;
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
      deploymentRoleArn,
    } = props;

    const sarName = developerId
      ? `${developerId}-sar-${environment}`
      : `sar-${environment}`;

    const dsarDeleteDLQueue = new Queue(this, 'dsarDeleteDLQueue', {
      queueName: `${sarName}-delete-dl-queue`,
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: kmsKey,
    });
    GovUKTag.of(dsarDeleteDLQueue)
      .PII.FALSE()
      .DataClassification.OFFICIAL_SENSITIVE()
      .Exposure.INTERNAL();

    const dsarDeleteQueue = new Queue(this, 'dsarDeleteQueue', {
      queueName: `${sarName}-delete-queue`,
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: kmsKey,
      deadLetterQueue: {
        queue: dsarDeleteDLQueue,
        maxReceiveCount: 3,
      },
    });
    GovUKTag.of(dsarDeleteQueue)
      .PII.FALSE()
      .DataClassification.OFFICIAL()
      .Exposure.INTERNAL();

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
      logRetentionDays: getLogRetentionPeriod(environment),
    });
    GovUKTag.of(dsarRequestLambda)
      // dsarRequestLambda/Function
      // dsarRequestLambda/Function/ServiceRole
      // dsarRequestLambda/LogGroup
      .DataClassification.OFFICIAL_SENSITIVE()
      .PII.TRUE()
      .Exposure.INTERNAL();

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
      logRetentionDays: getLogRetentionPeriod(environment),
    });
    GovUKTag.of(dsarDeleteLambda)
      // dsarDeleteLambda/Function
      // dsarDeleteLambda/Function/ServiceRole
      // dsarDeleteLambda/LogGroup
      .DataClassification.OFFICIAL_SENSITIVE()
      .PII.TRUE()
      .Exposure.INTERNAL();

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
    GovUKTag.of(sarDLQueue)
      .PII.TRUE()
      .DataClassification.OFFICIAL_SENSITIVE()
      .Exposure.INTERNAL();

    // Create S3 bucket for SAR files
    const sarBucketConstruct = new S3Construct(this, 'sarBucket', {
      developerId,
      environment,
      bucketName: 'govuk-udpsar-bucket',
      kmsKey,
      vpcId: vpc?.vpcId,
      deploymentRoleArn,
    });
    this.sarBucket = sarBucketConstruct.bucket;
    GovUKTag.of(sarBucketConstruct)
      // sarDLQueue
      // sarBucket/AccessLogsBucket
      // sarBucket/Bucket
      .DataClassification.OFFICIAL_SENSITIVE()
      .PII.TRUE()
      .Exposure.INTERNET_FACING();

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
      logRetentionDays: getLogRetentionPeriod(environment),
    });
    GovUKTag.of(createSarFileLambda)
      // createSarFile/Function
      // createSarFile/Function/ServiceRole
      // createSarFile/LogGroup
      .DataClassification.OFFICIAL_SENSITIVE()
      .PII.TRUE()
      .Exposure.INTERNAL();

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
        logRetentionDays: getLogRetentionPeriod(environment),
      },
    );
    GovUKTag.of(generateSarPresignedUrlLambda)
      // generateSarPresignedUrl/Function
      // generateSarPresignedUrl/Function/ServiceRole
      // generateSarPresignedUrl/LogGroup
      .DataClassification.OFFICIAL_SENSITIVE()
      .PII.FALSE()
      .Exposure.INTERNET_FACING();

    // Grant S3 read permissions to the lambda
    this.sarBucket.grantRead(generateSarPresignedUrlLambda.function);

    // Add S3 event notification for object created events
    this.sarBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(generateSarPresignedUrlLambda.function),
    );

    this.lambdas.push(generateSarPresignedUrlLambda.function);

    GovUKTag.buriedOf(this, `${environment}-sar/BucketNotificationsHandler`)
      .DataClassification.OFFICIAL()
      .PII.TRUE()
      .Exposure.INTERNAL();
  }
}
