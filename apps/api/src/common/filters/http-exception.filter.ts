import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Uniform error envelope (PRD §9.2): code, message_mn, message_en,
 * field_errors, retryable, request_id. Internal details never leak to
 * clients — they go to the server log keyed by request_id instead.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let messageMn = 'Системийн алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.';
    let messageEn = 'An internal error occurred. Please retry shortly.';
    let fieldErrors: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (typeof body === 'string') {
        messageEn = body;
        messageMn = body;
      } else if (body && typeof body === 'object') {
        code = body.code ?? HttpStatus[status] ?? code;
        messageEn = body.message_en ?? (Array.isArray(body.message) ? 'Validation failed' : body.message) ?? messageEn;
        messageMn = body.message_mn ?? (Array.isArray(body.message) ? 'Оруулсан утга буруу байна' : body.message) ?? messageMn;
        if (Array.isArray(body.message)) fieldErrors = body.message;
        if (body.field_errors) fieldErrors = body.field_errors;
      }
    } else {
      this.logger.error(`[${requestId}] ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      code,
      message_mn: messageMn,
      message_en: messageEn,
      field_errors: fieldErrors,
      retryable: status >= 500 || status === 429,
      request_id: requestId,
    });
  }
}

/** Helper to throw bilingual API errors with a stable machine code. */
export function apiError(status: number, code: string, messageMn: string, messageEn: string): HttpException {
  return new HttpException({ code, message_mn: messageMn, message_en: messageEn }, status);
}
