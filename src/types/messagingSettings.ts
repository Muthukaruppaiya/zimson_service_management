export type MessagingSettings = {
  smsEnabled: boolean;
  smsUrl: string;
  smsTemplateId: string;
  smsSender: string;
  smsService: string;
  smsOtpMessageTemplate: string;
  hasSmsToken: boolean;
  smsConfigured: boolean;

  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpOtpSubject: string;
  smtpOtpMessage: string;
  hasSmtpPassword: boolean;
  emailConfigured: boolean;

  whatsappEnabled: boolean;
  qikchatApiBaseUrl: string;
  qikchatTemplateName: string;
  qikchatTemplateLanguage: string;
  whatsappInvoiceMode: "template" | "media";
  messagingPublicBaseUrl: string;
  whatsappInvoiceDryRun: boolean;
  hasQikchatApiKey: boolean;
  whatsappConfigured: boolean;

  workdriveForInvoice: boolean;
  workdriveUploadUrl: string;
  workdriveHeaderName: string;
  hasWorkdriveToken: boolean;

  exposeDemoOtp: boolean | null;

  configuredFromDatabase: boolean;
  envFallbackActive: boolean;
  updatedAt: string;
  updatedBy: string | null;
};
