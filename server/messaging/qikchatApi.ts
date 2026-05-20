/** Qikchat WhatsApp API — https://qikchat.gitbook.io/apidocs */

export function qikchatApiHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "QIKCHAT-API-KEY": apiKey.trim(),
  };
}

export type QikchatSendMessageRow = {
  id?: string;
  channel?: string;
  from?: string;
  recipient?: string;
  status?: string;
  created_at?: string;
};

export type QikchatSendMessageResponse = {
  status?: boolean;
  message?: string;
  data?: QikchatSendMessageRow[];
};
