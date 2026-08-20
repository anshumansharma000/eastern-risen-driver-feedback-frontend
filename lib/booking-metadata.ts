export const TOUR_NAME_MAX_LENGTH = 200;
export const FILE_NUMBER_MAX_LENGTH = 100;

export type BookingMetadata = {
  tourName: string | null;
  fileNumber: string | null;
};

type FormValues = Pick<FormData, "get">;

export function optionalText(value: FormDataEntryValue | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function bookingMetadataFromForm(values: FormValues): BookingMetadata {
  return {
    tourName: optionalText(values.get("tourName")),
    fileNumber: optionalText(values.get("fileNumber")),
  };
}

export function bookingMetadataErrors(metadata: BookingMetadata): Partial<Record<keyof BookingMetadata, string>> {
  const errors: Partial<Record<keyof BookingMetadata, string>> = {};
  if (metadata.tourName && metadata.tourName.length > TOUR_NAME_MAX_LENGTH) {
    errors.tourName = `Tour name must be ${TOUR_NAME_MAX_LENGTH} characters or fewer.`;
  }
  if (metadata.fileNumber && metadata.fileNumber.length > FILE_NUMBER_MAX_LENGTH) {
    errors.fileNumber = `File number must be ${FILE_NUMBER_MAX_LENGTH} characters or fewer.`;
  }
  return errors;
}
