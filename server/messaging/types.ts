export type MessagingConfig = {
  whatsapp: {
    apiKey: string;
    templateName: string;
    /** Meta language code on the approved template (e.g. en, en_US). */
    templateLanguage: string;
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
