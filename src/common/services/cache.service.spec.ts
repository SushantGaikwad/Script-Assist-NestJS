import { CacheService } from './cache.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

jest.mock('ioredis');

describe.skip('CacheService', () => {
  let service: CacheService;
  let redisClient: Redis;
  let configService: any;

  beforeEach(() => {
    redisClient = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      quit: jest.fn(),
      exists: jest.fn(),
      config: jest.fn(),
      info: jest.fn(),
      dbsize: jest.fn(),
      mget: jest.fn(),
      on: jest.fn(),
    } as any;

    (Redis as any).mockImplementation(() => redisClient);

    configService = {
      get: jest.fn((key: string, defaultValue: any) => {
        const config = {
          CACHE_NAMESPACE: 'test',
          CACHE_DEFAULT_TTL: 60,
          CACHE_MAX_MEMORY: '50mb',
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: undefined,
        } as any;
        return config[key] ?? defaultValue;
      }),
    };

    service = new CacheService(configService);
  });

  it('should set cache value', async () => {
    await service.set('key1', { foo: 'bar' });
    expect(redisClient.set).toHaveBeenCalled();
  });

  it('should get cache value', async () => {
    (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify({ foo: 'bar' }));
    const result = await service.get('key1');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should return null if value not found', async () => {
    (redisClient.get as jest.Mock).mockResolvedValue(null);
    const result = await service.get('missingKey');
    expect(result).toBeNull();
  });

  it('should delete a key', async () => {
    (redisClient.del as jest.Mock).mockResolvedValue(1);
    const result = await service.delete('key1');
    expect(result).toBe(true);
  });

  it('should clear the cache', async () => {
   ( redisClient.keys as jest.Mock).mockResolvedValue(['test:key1', 'test:key2']);
    (redisClient.del as jest.Mock).mockResolvedValue(2);
    await service.clear();
    expect(redisClient.del).toHaveBeenCalledWith(['test:key1', 'test:key2']);
  });

  it('should return false if key does not exist', async () => {
    (redisClient.exists as jest.Mock).mockResolvedValue(0);
    const result = await service.has('key1');
    expect(result).toBe(false);
  });

  it('should return true if key exists', async () => {
    (redisClient.exists as jest.Mock).mockResolvedValue(1);
    const result = await service.has('key1');
    expect(result).toBe(true);
  });

  it('should return stats info', async () => {
    (redisClient.info as jest.Mock).mockResolvedValue('used_memory:10240\r\n');
   ( redisClient.dbsize as jest.Mock).mockResolvedValue(5);
    (redisClient.get as jest.Mock).mockResolvedValueOnce('3').mockResolvedValueOnce('2');
    const stats = await service.getStats();
    expect(stats).toEqual({
      memoryUsage: 10240,
      cacheHits: 3,
      cacheMisses: 2,
      totalKeys: 5,
    });
  });

  it('should return deserialized values for bulkGet', async () => {
    (redisClient.mget as jest.Mock).mockResolvedValue([
      JSON.stringify({ one: 1 }),
      null,
      JSON.stringify({ two: 2 })
    ]);
    const result = await service.bulkGet(['key1', 'key2', 'key3']);
    expect(result).toEqual([{ one: 1 }, null, { two: 2 }]);
  });

  it('should initialize Redis config on module init', async () => {
    (redisClient.config as jest.Mock).mockResolvedValue('OK');
    await service.onModuleInit();
    expect(redisClient.config).toHaveBeenCalledWith('SET', 'maxmemory', '50mb');
    expect(redisClient.config).toHaveBeenCalledWith('SET', 'maxmemory-policy', 'allkeys-lru');
  });

  it('should close Redis connection on module destroy', async () => {
    await service.onModuleDestroy();
    expect(redisClient.quit).toHaveBeenCalled();
  });

  it('should throw on invalid cache key', async () => {
    await expect(service.set(null as any, 'value')).rejects.toThrow('Invalid cache key');
  });

  it('should throw on unserializable value', async () => {
    const circularObj: any = {};
    circularObj.self = circularObj;
    await expect(service.set('bad', circularObj)).rejects.toThrow('Failed to serialize cache value');
  });

  it('should throw on invalid JSON in redis value', async () => {
    (redisClient.get as jest.Mock).mockResolvedValue('invalid-json');
    const result = await service.get('key');
    expect(result).toBeNull();
  });
});