import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Validates and normalizes an international phone number to E.164 digits
 * (no leading "+"), matching the storage format already used for legacy
 * Algerian numbers. Accepts any country; bare local numbers without a "+"
 * or country code are assumed to be Algerian for backward compatibility
 * with existing users/forms.
 *
 * Returns null when the input is empty or not a valid phone number for any
 * country — callers should treat null as "invalid" (or "absent" when the
 * field is optional).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, "DZ");
  if (!parsed || !parsed.isValid()) return null;

  return parsed.number.replace("+", "");
}

export const INVALID_PHONE_MESSAGE =
  "رقم الهاتف غير صحيح. الرجاء إدخال رقم دولي صحيح مع رمز الدولة.";
