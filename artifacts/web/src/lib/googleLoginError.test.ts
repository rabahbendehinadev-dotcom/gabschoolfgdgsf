import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_NOT_AUTHORIZED_CODE,
  getGoogleLoginErrorDescription,
  GOOGLE_LOGIN_GENERIC_ERROR_AR,
  UNAUTHORIZED_DEVICE_MESSAGE_AR,
} from "./googleLoginError";

test("Google login displays the server-provided localized device message", () => {
  const localized =
    "Cet appareil n’est pas autorisé pour ce compte. Contactez l’administration pour changer d’appareil.";

  assert.equal(
    getGoogleLoginErrorDescription({
      status: 403,
      data: { code: DEVICE_NOT_AUTHORIZED_CODE, message: localized },
    }),
    localized,
  );
});

test("Google login never falls back to the obsolete maximum-device message", () => {
  assert.equal(
    getGoogleLoginErrorDescription({
      status: 403,
      data: { code: DEVICE_NOT_AUTHORIZED_CODE },
    }),
    UNAUTHORIZED_DEVICE_MESSAGE_AR,
  );
  assert.equal(getGoogleLoginErrorDescription({ status: 500 }), GOOGLE_LOGIN_GENERIC_ERROR_AR);
  assert.equal(UNAUTHORIZED_DEVICE_MESSAGE_AR.includes("الحد الأقصى"), false);
});