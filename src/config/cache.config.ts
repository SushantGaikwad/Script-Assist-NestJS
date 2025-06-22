import { registerAs } from '@nestjs/config';

export default registerAs('cache', () => ({
  ttl: parseInt(process.env.CACHE_TTL ?? '300', 10), // 5 minutes default
  max: parseInt(process.env.CACHE_MAX_ITEMS ?? '1000', 10),
  refreshThreshold: parseInt(process.env.CACHE_REFRESH_THRESHOLD ?? '0.1', 10),
  // Cache strategies
  strategies: { 
    user: { ttl: 600 }, // 10 minutes for user data
    task: { ttl: 300 }, // 5 minutes for task data
    list: { ttl: 60 }, // 1 minute for list data
  },
}));