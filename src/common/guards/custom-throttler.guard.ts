import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    //  Enhanced tracking strategy
    const user = req.user as any;
    const ip = this.getClientIP(req);

    // Different tracking strategies based on authentication
    if (user?.id) {
      // Authenticated users: track by user ID + IP
      return `user:${user.id}:${ip}`;
    }

    // Anonymous users: track by IP + User-Agent for better fingerprinting
    const userAgent = req.get('User-Agent') || 'unknown';
    const fingerprint = this.createFingerprint(ip, userAgent);
    return `anon:${fingerprint}`;
  }

  protected async getThrottlerSuffix(
    context: ExecutionContext,
    throttlerName: string,
  ): Promise<string> {
    const request = context.switchToHttp().getRequest<Request>();
    const route = request.route?.path || request.url;

    //  Different limits for different endpoint types
    if (route.includes('/auth/')) {
      return 'auth';
    }

    if (route.includes('/users/')) {
      return 'users';
    }

    if (route.includes('/tasks/')) {
      return 'tasls';
    }

    return 'default';
  }

  private getClientIP(req: Request): string {
    //  Proper IP extraction considering proxies
    return (
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      'unknown'
    );
  }

  private createFingerprint(ip: string, userAgent: string): string {
    // Simple fingerprinting to prevent basic bypass attempts
    const crypto = require('crypto');
    return crypto.createHash('md5').update(`${ip}:${userAgent}`).digest('hex').substring(0, 16);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: any,
  ): Promise<void> {
    //  Enhanced error response with retry information
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();

    // Add rate limit headers
    response.header('X-RateLimit-Limit', throttlerLimitDetail.limit);
    response.header(
      'X-RateLimit-Remaining',
      Math.max(0, throttlerLimitDetail.limit - throttlerLimitDetail.totalHits),
    );
    response.header(
      'X-RateLimit-Reset',
      new Date(Date.now() + throttlerLimitDetail.ttl * 1000).toISOString(),
    );

    throw new ThrottlerException('Rate limit exceeded');
  }
}
