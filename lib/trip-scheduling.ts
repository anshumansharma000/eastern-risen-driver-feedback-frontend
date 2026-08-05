export type TripScheduleInput = {
  bookingId: string;
  pickupLocation: string;
  destination: string;
  scheduledAt: string;
  scheduledEndAt: string;
  vehicleId: string;
  driverId?: string;
};

export type TripFieldName = keyof TripScheduleInput;
export type TripValidationErrors = Partial<Record<TripFieldName, string>>;

export function normalizeLocation(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function validateTripSchedule(values: TripScheduleInput, now = new Date()): TripValidationErrors {
  const errors: TripValidationErrors = {};
  const start = Date.parse(values.scheduledAt);
  const end = Date.parse(values.scheduledEndAt);
  if (!values.scheduledAt || Number.isNaN(start)) errors.scheduledAt = "Enter the trip start date and time.";
  else if (start <= now.getTime()) errors.scheduledAt = "The trip must be scheduled in the future.";
  if (!values.scheduledEndAt || Number.isNaN(end)) errors.scheduledEndAt = "Enter the trip end date and time.";
  else if (!Number.isNaN(start) && end <= start) errors.scheduledEndAt = "The trip end time must be after the start time.";
  if (normalizeLocation(values.pickupLocation) === normalizeLocation(values.destination)) {
    errors.pickupLocation = "Pickup and destination must be different.";
    errors.destination = "Pickup and destination must be different.";
  }
  return errors;
}

export const assignmentErrorFields: Record<string, TripFieldName[]> = {
  TRIP_CANNOT_BE_SCHEDULED_IN_PAST: ["scheduledAt"],
  INVALID_TRIP_SCHEDULE: ["scheduledEndAt"],
  TRIP_LOCATIONS_MUST_DIFFER: ["pickupLocation", "destination"],
  ACTIVE_BOOKING_NOT_FOUND: ["bookingId"],
  TRIP_OUTSIDE_BOOKING_PERIOD: ["bookingId", "scheduledAt", "scheduledEndAt"],
  DRIVER_NOT_AVAILABLE_FOR_ASSIGNMENT: ["driverId"],
  DRIVER_SCHEDULE_CONFLICT: ["driverId", "scheduledAt", "scheduledEndAt"],
  VEHICLE_SCHEDULE_CONFLICT: ["vehicleId", "scheduledAt", "scheduledEndAt"],
  DRIVER_ON_LEAVE: ["driverId", "scheduledAt", "scheduledEndAt"],
  TRIP_OUTSIDE_DRIVER_SHIFT: ["driverId", "scheduledAt", "scheduledEndAt"],
  DRIVER_DAILY_DUTY_LIMIT_EXCEEDED: ["driverId", "scheduledAt", "scheduledEndAt"],
};

export function changedTripFields(
  trip: Omit<TripScheduleInput, "bookingId" | "vehicleId" | "driverId"> & { booking:{id:string}; vehicle: { id:string }; driver: { id:string } },
  values: TripScheduleInput & { driverId:string },
) {
  const patch: Partial<TripScheduleInput> = {};
  if (values.bookingId !== trip.booking.id) patch.bookingId = values.bookingId;
  for (const field of ["pickupLocation", "destination"] as const) {
    if (values[field] !== trip[field]) patch[field] = values[field];
  }
  if (Date.parse(values.scheduledAt) !== Date.parse(trip.scheduledAt)) patch.scheduledAt = values.scheduledAt;
  if (Date.parse(values.scheduledEndAt) !== Date.parse(trip.scheduledEndAt)) patch.scheduledEndAt = values.scheduledEndAt;
  if (values.vehicleId !== trip.vehicle.id) patch.vehicleId = values.vehicleId;
  if (values.driverId !== trip.driver.id) patch.driverId = values.driverId;
  return patch;
}
