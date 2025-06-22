import { registerAs } from '@nestjs/config';

export default registerAs('throttler', () => ({
  default: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10), // 1 minute
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  auth: {
    ttl: parseInt(process.env.AUTH_THROTTLE_TTL ?? '900000', 10), // 15 minutes
    limit: parseInt(process.env.AUTH_THROTTLE_LIMIT ?? '5', 10),
  },
  users: {
    ttl: parseInt(process.env.API_THROTTLE_TTL ?? '60000', 10), // 1 minute
    limit: parseInt(process.env.API_THROTTLE_LIMIT ?? '50', 10),
  },
}));
