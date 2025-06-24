import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly namespace: string;
  private readonly defaultTTL: number;
  private readonly maxMemory: string;

  constructor(private configService: ConfigService) {
    this.namespace = this.configService.get<string>('CACHE_NAMESPACE', 'app') + ':';
    this.defaultTTL = this.configService.get<number>('CACHE_DEFAULT_TTL', 300);
    this.maxMemory = this.configService.get<string>('CACHE_MAX_MEMORY', '100mb');

    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 2000),
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
  }

  async onModuleInit() {
    // Configure Redis with LRU eviction policy
    await this.redis.config('SET', 'maxmemory', this.maxMemory);
    await this.redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
    this.logger.log('Cache service initialized with Redis');
  }

  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Cache service shut down');
  }

  private getNamespacedKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid cache key');
    }
    return `${this.namespace}${key}`;
  }

  private serialize(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch (error: any) {
      this.logger.error(`Serialization error: ${error.message}`);
      throw new Error('Failed to serialize cache value');
    }
  }

  private deserialize<T>(value: string): T {
    try {
      return JSON.parse(value) as T;
    } catch (error: any) {
      this.logger.error(`Deserialization error: ${error.message}`);
      throw new Error('Failed to deserialize cache value');
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = this.defaultTTL): Promise<void> {
    const start = Date.now();
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const serializedValue = this.serialize(value);
      await this.redis.set(namespacedKey, serializedValue, 'EX', ttlSeconds);
      this.logger.debug(`Cache set: ${key}, duration: ${Date.now() - start}ms`);
    } catch (error: any) {
      this.logger.error(`Cache set error for key ${key}: ${error.message}`);
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const start = Date.now();
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const value = await this.redis.get(namespacedKey);
      
      if (value === null) {
        this.logger.debug(`Cache miss: ${key}, duration: ${Date.now() - start}ms`);
        return null;
      }

      const deserializedValue = this.deserialize<T>(value);
      this.logger.debug(`Cache hit: ${key}, duration: ${Date.now() - start}ms`);
      return deserializedValue;
    } catch (error: any) {
      this.logger.error(`Cache get error for key ${key}: ${error.message}`);
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const result = await this.redis.del(namespacedKey);
      return result > 0;
    } catch (error: any) {
      this.logger.error(`Cache delete error for key ${key}: ${error.message}`);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.namespace}*`);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      this.logger.log('Cache cleared');
    } catch (error: any) {
      this.logger.error(`Cache clear error: ${error.message}`);
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const exists = await this.redis.exists(namespacedKey);
      return exists > 0;
    } catch (error: any) {
      this.logger.error(`Cache has error for key ${key}: ${error.message}`);
      return false;
    }
  }

  async getStats(): Promise<{
    memoryUsage: number;
    cacheHits: number;
    cacheMisses: number;
    totalKeys: number;
  }> {
    try {
      const [info, totalKeys] = await Promise.all([
        this.redis.info('MEMORY'),
        this.redis.dbsize(),
      ]);
      
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;

      return {
        memoryUsage,
        cacheHits: parseInt(await this.redis.get('stats:hits') || '0', 10),
        cacheMisses: parseInt(await this.redis.get('stats:misses') || '0', 10),
        totalKeys,
      };
    } catch (error: any) {
      this.logger.error(`Cache stats error: ${error.message}`);
      throw error;
    }
  }

  async bulkGet<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const namespacedKeys = keys.map((key) => this.getNamespacedKey(key));
      const values = await this.redis.mget(...namespacedKeys);
      return values.map((value) => (value ? this.deserialize<T>(value) : null));
    } catch (error: any) {
      this.logger.error(`Bulk get error: ${error.message}`);
      throw error;
    }
  }
}