export type MessagingConfig = {
  whatsapp: {
    apiKey: string;
    templateName: string;
    /** Meta language code on the approved template (e.g. en, en_US). */
    templateLanguage: string;
    /** SRF tracking with PDF header — approved template name in Qikchat/Meta. */
    trackingTemplateName: string;
    /** Tracking fallback without document header (body-only template). */
    trackingTextTemplateName: string;
    /** Re-estimate / site visit approval template name. */
    approvalTemplateName: string;
    /** Reference body registered in Meta for tracking template ({{1}} customer, {{2}} SRF, {{3}} URL). */
    trackingTemplateBody: string;
    /** Reference body for approval template ({{1}}–{{4}}). */
    approvalTemplateBody: string;
    /** Reference body for invoice template ({{1}} customer, {{2}} invoice no). */
    invoiceTemplateBody: string;
  };
  sms: {
    url: string;
    bearerToken: string;
    templateId: string;
    sender: string;
    service: string;
    /** DLT template body; use {{1}} for OTP digits (Qikberry replaces on send). */
    otpMessageTemplate: string;
  };
  email: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
    otpSubject: string;
    otpTextTemplate: string;
  };
};
