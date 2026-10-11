import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ProblemDetailsException } from '../../../domain/errors/problem-details.js';

export function problemDetailsErrorHandler(
  error: FastifyError | ProblemDetailsException | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // 1. If error is an explicit RFC 9457 Domain Exception
  if (error instanceof ProblemDetailsException) {
    void reply
      .status(error.status)
      .header('Content-Type', 'application/problem+json; charset=utf-8')
      .send({
        ...error.toJSON(),
        instance: request.url,
      });
    return;
  }

  // 2. Fastify native body parse errors (e.g., malformed JSON body)
  if ('statusCode' in error && error.statusCode === 400) {
    void reply
      .status(400)
      .header('Content-Type', 'application/problem+json; charset=utf-8')
      .send({
        type: 'https://gateway.internal/errors/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: error.message,
        instance: request.url,
      });
    return;
  }

  // 3. Fallback for unhandled internal exceptions (HTTP 500)
  request.log.error(error, 'Unhandled internal server error occurred');

  void reply
    .status(500)
    .header('Content-Type', 'application/problem+json; charset=utf-8')
    .send({
      type: 'https://gateway.internal/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected internal error occurred while processing the request.',
      instance: request.url,
    });
}