/** Email provider port — mock in dev, SMTP (nodemailer) in production. */
export interface EmailSendResult {
  providerRef: string;
  /** true when the provider confirms hand-off synchronously. */
  delivered: boolean;
}

export interface EmailPort {
  readonly code: string;
  send(args: { to: string; subject: string; text: string; cc?: string }): Promise<EmailSendResult>;
}

export const EMAIL_PORT = 'EMAIL_PORT';
