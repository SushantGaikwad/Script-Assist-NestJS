import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

// Feature modules
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';

// Infrastructure modules
import { TaskProcessorModule } from './queues/task-processor/task-processor.module';
import { ScheduledTasksModule } from './queues/scheduled-tasks/scheduled-tasks.module';

// Shared services and infrastructure
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// Configuration
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';
import appConfig from './config/app.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    //  Global Configuration with multiple config files
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, jwtConfig, appConfig],
      cache: true, // Enable config caching
    }),

    //  Database with proper connection pooling
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
        // Connection pooling for performance
        extra: {
          connectionLimit: 20,
          acquireTimeout: 60000,
          timeout: 60000,
        },
      }),
    }),

    //  Distributed Redis Cache
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisConfig = configService.get('redis');
        return {
          store: redisStore,
          host: redisConfig.host,
          port: redisConfig.port,
          ttl: 300, // Default 5 minutes
          max: 1000, // Maximum number of items in cache
          // Distributed cache invalidation
          keyPrefix: `${configService.get('APP_NAME')}:cache:`,
        };
      },
      isGlobal: true,
    }),

    //  Scheduling
    ScheduleModule.forRoot(),

    //  Enhanced BullMQ configuration
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis');
        console.log('>>> redisConfig :', redisConfig);
        return {
          connection: {
            host: redisConfig.host,
            port: redisConfig.port,
            // Connection resilience
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            removeOnComplete: 50,
            removeOnFail: 100,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        };
      },
    }),

    //  Flexible Rate Limiting with Redis
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const throttlerConfig = configService.get('throttler');
        return {
          ...throttlerConfig,
        };
      },
    }),

    //  Feature modules
    AuthModule,
    UsersModule,
    TasksModule,

    //  Queue processing modules
    TaskProcessorModule,
    ScheduledTasksModule,
  ],
  providers: [
    //  Global exception handling
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    //  Global logging interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    //  Validate critical configuration on startup
    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    const requiredConfig = [
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_DATABASE',
      'REDIS_HOST',
      'REDIS_PORT',
      'JWT_SECRET',
    ];

    for (const config of requiredConfig) {
      if (!this.configService.get(config)) {
        throw new Error(`Missing required configuration: ${config}`);
      }
    }
  }
}
