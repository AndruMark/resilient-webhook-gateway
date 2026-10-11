import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/infrastructure/http/server.js';
import { DatabasePoolFactory } from '../../src/infrastructure/persistence/postgres/database-pool.js';

describe('HTTP API & RFC 9457 Error Handling Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await DatabasePoolFactory.close();
  });

  it('GET /health should return 200 OK with health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('healthy');
  });

  it('POST /api/v1/events with invalid CloudEvent should return 400 and RFC 9457 format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      payload: {
        specversion: '0.9', // Invalid CloudEvent version
        // Missing mandatory attributes: id, source, type, data
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');

    const body = response.json();
    expect(body.type).toBe('https://gateway.internal/errors/invalid-cloud-event');
    expect(body.title).toBe('Invalid CloudEvent Specification');
    expect(body.status).toBe(400);
    expect(body.instance).toBe('/api/v1/events');
    expect(body.invalidParams).toBeDefined();
    expect(Array.isArray(body.invalidParams)).toBe(true);
  });

  it('POST /api/v1/events with malformed JSON should return 400 Bad Request Problem Details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: {
        'content-type': 'application/json',
      },
      body: '{ invalid_json ',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');

    const body = response.json();
    expect(body.type).toBe('https://gateway.internal/errors/bad-request');
    expect(body.status).toBe(400);
  });
});