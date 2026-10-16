export const mainStackParameterNames = (stackPrefix: string) => {
  const base = `/udp/${stackPrefix}/main`;
  return {
    dataTableStreamArn: `${base}/data-table-stream-arn`,
    kmsKeyArn: `${base}/kms-key-arn`,
    dbKmsKeyArn: `${base}/db-kms-key-arn`,
  };
};
