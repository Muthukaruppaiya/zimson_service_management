/**
 * Qikberry SMS REST API — https://apidocs.qikberry.ai/
 */

export const QIKBERRY_SMS_API_BASE = "https://rest.qikberry.ai/v1/sms";

export const QIKBERRY_SMS_ENDPOINTS = {
  sendMessage: `${QIKBERRY_SMS_API_BASE}/messages`,
  messageStatus: `${QIKBERRY_SMS_API_BASE}/status`,
  senders: `${QIKBERRY_SMS_API_BASE}/senders`,
  templates: `${QIKBERRY_SMS_API_BASE}/templates`,
} as const;

export type QikberrySendMessageResponse = {
  message?: string;
  data?: Array<{
    message_id?: string;
    mobile?: string;
    message?: string;
  }>;
};

export type QikberryMessageStatusRow = {
  message_id?: string;
  phone?: string;
  status?: string;
  service?: string;
  sender?: string;
  template_id?: string;
  message?: string;
};

/**
 * Java SmsService headers:
 * Authorization: Bearer {token}
 * Content-Type: application/json
 * template_id: {templateId}  (also in JSON body)
 */
export function qikberryAuthHeaders(bearerToken: string, templateId?: string): Record<string, string> {
  const raw = bearerToken.trim().replace(/^bearer\s+/i, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${raw}`,
    "Content-Type": "application/json",
  };
  if (templateId?.trim()) {
    headers.template_id = templateId.trim();
  }
  return headers;
}
