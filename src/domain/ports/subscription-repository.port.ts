import { Subscription } from '../models/subscription.js';

export interface SubscriptionRepositoryPort {
  findById(id: string): Promise<Subscription | null>;
  findActiveByEventType(eventType: string): Promise<readonly Subscription[]>;
}