import http from 'node:http';
import { NodeCryptoSignatureVerifier } from '../src/infrastructure/crypto/node-crypto-signature-verifier.js';

const GATEWAY_URL = 'http://127.0.0.1:3000';
const RECEIVER_PORT = 4000;
const RECEIVER_URL = `http://127.0.0.1:${RECEIVER_PORT}/webhook`;
const SECRET_KEY = 'super_secret_webhook_signing_key_production_grade';

const verifier = new NodeCryptoSignatureVerifier();
let simulateFailureOnce = true;

// 1. Create Mock Subscriber HTTP Server
const receiverServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      const signature = req.headers['x-webhook-signature'] as string;
      const attempt = req.headers['x-webhook-attempt'] as string;
      const eventType = req.headers['x-webhook-event-type'] as string;

      console.log('\n📩 [Mock Receiver] Received Incoming Webhook:');
      console.log(`   - Event Type: ${eventType}`);
      console.log(`   - Delivery Attempt: #${attempt}`);
      console.log(`   - Signature Header: ${signature}`);

      // Verify HMAC-SHA256 signature in constant-time
      const isValid = verifier.verify(body, signature, SECRET_KEY);
      console.log(`   - Signature Authenticity: ${isValid ? '✅ VALID (Authentic)' : '❌ INVALID (Forged)'}`);

      if (simulateFailureOnce) {
        console.log('   - ⚠️ [Mock Receiver] Simulating target server failure (HTTP 500)...');
        simulateFailureOnce = false; // Next retry will succeed
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Temporary internal database deadlock' }));
        return;
      }

      console.log('   - 🟢 [Mock Receiver] Processing successfully (HTTP 200 OK)');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

async function runDemo() {
  receiverServer.listen(RECEIVER_PORT, async () => {
    console.log(`🎯 Mock Receiver listening on http://localhost:${RECEIVER_PORT}/webhook`);

    try {
      // 2. Register Subscription in Gateway
      console.log('\n1️⃣  Registering subscription in Gateway...');
      const subResponse = await fetch(`${GATEWAY_URL}/api/v1/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: RECEIVER_URL,
          secretKey: SECRET_KEY,
          subscribedEvents: ['com.ecommerce.order.created'],
          maxAttempts: 3,
          initialIntervalSec: 2,
        }),
      });

      const subscription = await subResponse.json();
      console.log('✅ Subscription registered:', subscription.id);

      // 3. Ingest a CloudEvent v1.0.2
      console.log('\n2️⃣  Ingesting CNCF CloudEvent v1.0.2 into Gateway...');
      const eventPayload = {
        specversion: '1.0',
        id: `evt_${Date.now()}`,
        source: '/microservices/checkout-api',
        type: 'com.ecommerce.order.created',
        datacontenttype: 'application/json',
        data: {
          orderId: 'ord_98765',
          customerId: 'usr_4432',
          totalAmount: 18450.0,
          currency: 'ARS',
          items: [
            { sku: 'NOTEBOOK-RYZEN-5', quantity: 1, unitPrice: 18450.0 },
          ],
        },
      };

      const ingestResponse = await fetch(`${GATEWAY_URL}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload),
      });

      const ingestResult = await ingestResponse.json();
      console.log(`✅ Ingestion HTTP Status: ${ingestResponse.status} Accepted`);
      console.log('   Event Queued in Outbox:', ingestResult);

      console.log('\n⏳ Waiting for Outbox Dispatcher Worker to poll and dispatch...');
      console.log('   (Watch the retry mechanism handle the initial failure)\n');

      // Keep process alive for 12 seconds to observe initial attempt and backoff retry
      setTimeout(() => {
        console.log('\n✨ Live Demonstration Finished.');
        receiverServer.close();
        process.exit(0);
      }, 12000);
    } catch (err) {
      console.error('❌ Error during demo:', err);
      receiverServer.close();
      process.exit(1);
    }
  });
}

void runDemo();