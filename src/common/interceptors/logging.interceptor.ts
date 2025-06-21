import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { url, method } = req;
    const userId = req.user?.id || 'anonymous';
    const now = Date.now();

    // Basic implementation (to be enhanced by candidates)
    this.logger.log(`Request: ${method} ${url} - User: ${userId} - Started`);

    return next.handle().pipe(
      tap({
        next: val => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const delay = Date.now() - now;
          this.logger.log(
            `Response: ${method} ${url} - User: ${userId} - ${statusCode} - ${delay}ms`,
          );
        },
        error: err => {
          const delay = Date.now() - now;
          this.logger.error(
            `Error in ${method} ${url} - User: ${userId} - ERROR: ${err.message} - ${delay}ms`,
          );
        },
      }),
    );
  }
}
