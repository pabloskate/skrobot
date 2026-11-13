import { networkInterfaces } from 'node:os';

const macMiniHost = '100.74.88.58';
const host = process.env.SKROBOT_PREVIEW_HOST || (
  Object.values(networkInterfaces()).some((interfaces) =>
    interfaces?.some(({ address }) => address === macMiniHost),
  ) ? macMiniHost : '127.0.0.1'
);

console.log(host);
