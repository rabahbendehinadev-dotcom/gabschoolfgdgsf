export const DEVICE_NOT_AUTHORIZED_CODE = "DEVICE_NOT_AUTHORIZED";

export const UNAUTHORIZED_DEVICE_MESSAGE_AR =
  "هذا الجهاز غير مصرح به لهذا الحساب. تواصل مع الإدارة لتغيير الجهاز.";

export const GOOGLE_LOGIN_GENERIC_ERROR_AR =
  "تعذّر تسجيل الدخول عبر Google، حاول مرة أخرى";

type GoogleLoginApiError = {
  status?: number;
  data?: {
    code?: string;
    message?: string;
  };
};

export function getGoogleLoginErrorDescription(error: GoogleLoginApiError): string {
  const serverMessage = error.data?.message?.trim();
  if (serverMessage) return serverMessage;

  if (error.data?.code === DEVICE_NOT_AUTHORIZED_CODE || error.status === 403) {
    return UNAUTHORIZED_DEVICE_MESSAGE_AR;
  }

  return GOOGLE_LOGIN_GENERIC_ERROR_AR;
}