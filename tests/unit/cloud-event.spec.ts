import { describe, it, expect } from 'vitest';
import { CloudEvent } from '../../src/domain/models/cloud-event.js';
import { InvalidCloudEventException } from '../../src/domain/errors/domain-errors.js';

describe('CloudEvent Domain Model', () => {
  it('should instantiate a valid CloudEvent v1.0.2 conforming to CNCF spec', () => {
    const rawPayload = {
      specversion: '1.0',
      id: 'evt_123456789',
      source: '/orders/service-prod',
      type: 'com.enterprise.order.created',
      datacontenttype: 'application/json',
      time: '2026-10-10T23:00:00Z',
      data: { orderId: 'ord_999', total: 150.5 },
    };

    const event = CloudEvent.create(rawPayload);

    expect(event.id).toBe('evt_123456789');
    expect(event.specversion).toBe('1.0');
    expect(event.source).toBe('/orders/service-prod');
    expect(event.type).toBe('com.enterprise.order.created');
    expect(event.data).toEqual({ orderId: 'ord_999', total: 150.5 });
  });

  it('should fail with RFC 9457 InvalidCloudEventException when required attributes are missing', () => {
    const invalidPayload = {
      specversion: '0.3', // invalid spec version
      // missing id, source, and type
      data: { test: true },
    };

    expect(() => CloudEvent.create(invalidPayload)).toThrow(InvalidCloudEventException);

    try {
      CloudEvent.create(invalidPayload);
    } catch (err) {
      const error = err as InvalidCloudEventException;
      expect(error.status).toBe(400);
      expect(error.type).toBe('https://gateway.internal/errors/invalid-cloud-event');
      expect(error.invalidParams).toBeDefined();
      expect(error.invalidParams?.map((p) => p.name)).toEqual(
        expect.arrayContaining(['specversion', 'id', 'source', 'type'])
      );
    }
  });
});