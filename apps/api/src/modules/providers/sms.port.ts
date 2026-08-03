/** SMS provider port — mock in dev, CallPro Text API in production. */
export interface SmsSendResult {
  /** Provider-assigned message id (delivery tracking). */
  providerRef: string;
  /** true when the provider already confirms delivery synchronously (mock). */
  delivered: boolean;
}

export interface SmsPort {
  readonly code: string;
  send(args: { tenantId: string; to: string; text: string }): Promise<SmsSendResult>;
}
