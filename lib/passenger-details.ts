import type { SubmitFeedbackRequest } from './contracts.ts';
import { normalizeRespondentPhone } from './group-feedback.ts';
import { phoneError, type E164Phone } from './phone.ts';

export type PassengerDetails = { name:string; phone:string; email:string; bookingReference:string; consent:boolean };

export function passengerDetailsErrors(details:PassengerDetails, expectedBookingReference?:string):Record<string,string> {
  const errors:Record<string,string> = {};
  const phone = normalizeRespondentPhone(details.phone);
  const invalidPhone = details.phone.trim() ? phoneError(phone) : 'Enter your mobile number.';
  if (invalidPhone) errors.phone = invalidPhone;
  if (details.name.trim().length > 200) errors.name = 'Keep your name within 200 characters.';
  const email = details.email.trim();
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)) errors.email = 'Enter a valid email address, or leave it blank.';
  const reference = details.bookingReference.trim();
  if (reference.length > 100) errors.bookingReference = 'Keep the booking reference within 100 characters.';
  else if (reference && expectedBookingReference && reference.toLowerCase() !== expectedBookingReference.trim().toLowerCase()) errors.bookingReference = 'This reference does not match your journey. Check it or leave it blank.';
  if (!details.consent) errors.consent = 'Please accept the privacy notice before continuing.';
  return errors;
}

export function passengerRespondent(details:PassengerDetails, consentedAt:string):SubmitFeedbackRequest['respondent'] {
  if (!details.consent) throw new Error("Privacy consent must be accepted before submitting feedback.");
  return {
    phone:normalizeRespondentPhone(details.phone) as E164Phone,
    ...(details.name.trim() ? {name:details.name.trim()} : {}),
    ...(details.email.trim() ? {email:details.email.trim()} : {}),
    ...(details.bookingReference.trim() ? {bookingReference:details.bookingReference.trim()} : {}),
    consentAccepted:true,
    consentedAt,
  };
}
