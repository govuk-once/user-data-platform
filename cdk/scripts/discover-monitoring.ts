import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  discoverMonitoredResources,
  type MonitoringInventory,
} from '../lib/utils/discover-monitored-resources';

async function main() {
  const region = process.env.AWS_REGION ?? 'eu-west-2';
  const environment = process.env.ENVIRONMENT;
  const developerId = process.env.DEVELOPER_ID || undefined;

  if (!environment) {
    throw new Error('ENVIRONMENT must be provided');
  }

  const { lambdaNames, tableNames } = await discoverMonitoredResources(
    region,
    environment,
    developerId,
  );

  const inventory: MonitoringInventory = {
    lambdaNames,
    tableNames,
  };

  const outputPath = path.resolve(
    process.cwd(),
    'cdk/.generated/monitoring-inventory.json',
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2));

  console.log(`Inventory written to ${outputPath}`);
  console.log(`Lambda functions: ${lambdaNames.length}`);
  console.log(`DynamoDB tables: ${tableNames.length}`);
}

main().catch((error) => {
  console.error('Monitoring discovery failed:', error);
  process.exitCode = 1;
});
