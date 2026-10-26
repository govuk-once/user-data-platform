import { createHash } from 'node:crypto';

export const hashUdpId = (udpid: string): string =>
  createHash('sha256').update(udpid).digest('hex');
