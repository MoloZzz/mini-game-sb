import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logs every request once it settles, so a single line carries the outcome
 * (status/duration) instead of splitting entry/exit across two lines.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { player?: { id: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(method, originalUrl, response.statusCode, start, request.player?.id),
        error: (err: unknown) =>
          this.log(method, originalUrl, this.resolveErrorStatus(err, response), start, request.player?.id),
      }),
    );
  }

  private resolveErrorStatus(err: unknown, response: Response): number {
    const status = (err as { status?: number })?.status;
    return status ?? response.statusCode ?? 500;
  }

  private log(method: string, url: string, status: number, start: number, playerId?: string): void {
    const durationMs = Date.now() - start;
    const suffix = playerId ? ` player=${playerId}` : '';
    const line = `${method} ${url} ${status} ${durationMs}ms${suffix}`;
    if (status >= 500) {
      this.logger.error(line);
    } else if (status >= 400) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}
