import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      // Use NestJS built-in logger instead of console
      logger: ['error', 'warn', 'log'],
    });

    const configService = app.get(ConfigService);

    //  Security: Helmet for security headers
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
      }),
    );

    //  Performance: Enable compression
    app.use(compression());

    //  Security: Proper CORS configuration
    app.enableCors({
      origin: configService.get('ALLOWED_ORIGINS')?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 86400, // 24 hours
    });

    //  Global validation pipe with enhanced security
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        disableErrorMessages: configService.get('NODE_ENV') === 'production',
        transformOptions: {
          enableImplicitConversion: true,
        },
        //  Prevent prototype pollution
        forbidUnknownValues: true,
      }),
    );

    //  Request size and timeout limits
    app.use(require('express').json({ limit: '10mb' }));
    app.use(require('express').urlencoded({ extended: true, limit: '10mb' }));

    //  Environment-gated Swagger documentation
    const nodeEnv = configService.get('NODE_ENV');
    if (nodeEnv !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('TaskFlow API')
        .setDescription('Task Management System API')
        .setVersion('1.0')
        .addBearerAuth({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        })
        .addServer(`http://localhost:${configService.get('PORT') || 3000}`, 'Development')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
        },
      });

      logger.log(
        `Swagger documentation: http://localhost:${configService.get('PORT') || 3000}/api/docs`,
      );
    }

    //  Health check endpoint
    app.use('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: configService.get('NODE_ENV'),
        version: process.env.npm_package_version || '1.0.0',
      });
    });

    //  Request timeout middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
      const timeout = 30000; // 30 seconds
      const timer = setTimeout(() => {
        if (!res.headersSent) {
          res.status(408).json({
            error: 'Request Timeout',
            message: 'Request took too long to process',
          });
        }
      }, timeout);

      res.on('finish', () => clearTimeout(timer));
      res.on('close', () => clearTimeout(timer));
      next();
    });

    const port = configService.get('PORT') || 3000;

    await app.listen(port);

    logger.log(`🚀 Application running on: http://localhost:${port}`);
    logger.log(`📊 Environment: ${nodeEnv}`);
    logger.log(`🔍 Health check: http://localhost:${port}/health`);
  } catch (error) {
    logger.error('Error starting application:', error);
    process.exit(1);
  }
}

// Handle bootstrap errors
bootstrap().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
