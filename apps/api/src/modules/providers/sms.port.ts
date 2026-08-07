/** SMS provider port — mock in dev, CallPro Text API in production. */
export interface SmsSendResult {
  /** Provider-assigned message id (delivery tracking). */
  providerRef: string;
  /** true when the provider already confirms delivery synchronously (mock). */
  delivered: boolean;
}

/** Delivery outcome polled from the provider (CallPro §2 message-detail). */
export interface SmsDeliveryStatus {
  /** QUEUED → still in flight; DELIVERED / UNDELIVERED are final. */
  state: 'QUEUED' | 'DELIVERED' | 'UNDELIVERED' | 'UNKNOWN';
  /** Segments the provider actually billed (may exceed our estimate). */
  segments?: number;
}

export interface SmsPort {
  readonly code: string;
  send(args: { tenantId: string; to: string; text: string }): Promise<SmsSendResult>;
  /** Optional: poll a sent message's delivery state by its providerRef. */
  getStatus?(tenantId: string, providerRef: string): Promise<SmsDeliveryStatus>;
}
