import { createHmac } from 'node:crypto';
import { required } from './config';
export const directHash = (value: string) =>
  createHmac('sha256', required('TOKEN_ENCRYPTION_KEY'))
    .update('instagram:' + value)
    .digest('hex');
