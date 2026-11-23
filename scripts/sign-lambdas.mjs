/**
 * Signs each Lambda build directory using AWS Signer before CDK deployment.
 *
 * Required env vars (set by the CI workflow):
 *   SIGNING_PROFILE_NAME  – name of the AWS Signer profile (from {env}-vpc stack output)
 *   AWS_REGION            – AWS region (defaults to eu-west-2)
 *
 * When SIGNING_PROFILE_NAME is absent the script exits cleanly so local CDK
 * synth / diff continues to work without signing credentials.
 *
 * Required IAM permissions on the deployment role:
 *   signer:StartSigningJob, signer:DescribeSigningJob
 *   s3:GetObject, s3:PutObject, s3:GetObjectVersion on the CDK bootstrap bucket
 */

import {
  SignerClient,
  StartSigningJobCommand,
  DescribeSigningJobCommand,
} from '@aws-sdk/client-signer';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const SIGNING_PROFILE_NAME = process.env.SIGNING_PROFILE_NAME;

if (!SIGNING_PROFILE_NAME) {
  console.log('SIGNING_PROFILE_NAME not set — skipping Lambda signing.');
  process.exit(0);
}

const region = process.env.AWS_REGION ?? 'eu-west-2';
const signerClient = new SignerClient({ region });
const s3Client = new S3Client({ region });

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = resolve(root, 'build');

function getCdkBootstrapBucket() {
  return execSync(
    `aws cloudformation describe-stacks --stack-name CDKToolkit ` +
      `--query 'Stacks[0].Outputs[?OutputKey==\`BucketName\`].OutputValue' --output text`,
    { encoding: 'utf-8' },
  ).trim();
}

async function findLambdaDirs() {
  const entries = await readdir(buildDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function startSigningJob(lambdaName, bucket) {
  const sourceKey = `signing-tmp/${lambdaName}/source.zip`;
  const zipPath = resolve(buildDir, `${lambdaName}.zip`);
  const dirPath = resolve(buildDir, lambdaName);

  execSync(`cd "${dirPath}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });

  const { VersionId: versionId } = await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: sourceKey,
      Body: createReadStream(zipPath),
    }),
  );

  if (!versionId) {
    throw new Error(
      `S3 bucket ${bucket} must have versioning enabled — AWS Signer requires a version ID on the source object.`,
    );
  }

  const { jobId } = await signerClient.send(
    new StartSigningJobCommand({
      source: {
        s3: { bucketName: bucket, key: sourceKey, version: versionId },
      },
      destination: {
        s3: { bucketName: bucket, prefix: `signing-tmp/${lambdaName}/signed/` },
      },
      profileName: SIGNING_PROFILE_NAME,
    }),
  );

  return { lambdaName, jobId, zipPath, bucket };
}

async function awaitAndDownload({ lambdaName, jobId, zipPath, bucket }) {
  let result;
  do {
    await new Promise((r) => setTimeout(r, 3000));
    result = await signerClient.send(new DescribeSigningJobCommand({ jobId }));
  } while (result.status === 'InProgress');

  if (result.status !== 'Succeeded') {
    throw new Error(
      `Signing job ${jobId} for ${lambdaName} failed: ${result.statusReason ?? result.status}`,
    );
  }

  const signedKey = result.signedObject?.s3?.key;
  if (!signedKey) {
    throw new Error(
      `No signed object key returned for ${lambdaName} (job ${jobId})`,
    );
  }

  const { Body } = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: signedKey }),
  );
  await pipeline(Body, createWriteStream(zipPath));

  console.log(`  ✓ ${lambdaName}`);
}

const bucket = getCdkBootstrapBucket();
const lambdaDirs = await findLambdaDirs();

if (lambdaDirs.length === 0) {
  console.log('No Lambda build directories found — nothing to sign.');
  process.exit(0);
}

console.log(
  `Signing ${lambdaDirs.length} Lambda asset(s) using profile '${SIGNING_PROFILE_NAME}'...`,
);

const jobs = await Promise.all(
  lambdaDirs.map((name) => startSigningJob(name, bucket)),
);
await Promise.all(jobs.map(awaitAndDownload));

console.log(`\nAll ${lambdaDirs.length} Lambda asset(s) signed successfully.`);
