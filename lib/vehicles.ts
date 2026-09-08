import type { CreateVehicleRequest, UpdateVehicleRequest, Vehicle } from "./contracts.ts";

export const vehicleFields = [
  "displayName",
  "registrationNumber",
  "vehicleType",
  "registeredOwner",
  "address",
  "contactNumber",
  "accountNumber",
  "ifscCode",
  "bankName",
] as const;

export type VehicleField = (typeof vehicleFields)[number];
export type VehicleFieldErrors = Partial<Record<VehicleField, string>>;

const requiredFields = ["displayName", "registrationNumber", "vehicleType"] as const;
const optionalFields = ["registeredOwner", "address", "contactNumber", "accountNumber", "ifscCode", "bankName"] as const;

function text(data: FormData, field: VehicleField) {
  return String(data.get(field) ?? "").trim();
}

export function validateVehicleForm(data: FormData): VehicleFieldErrors {
  return Object.fromEntries(
    requiredFields.flatMap((field) => text(data, field) ? [] : [[field, "This field is required."]]),
  );
}

export function createVehiclePayload(data: FormData): CreateVehicleRequest {
  const body: CreateVehicleRequest = {
    displayName: text(data, "displayName"),
    registrationNumber: text(data, "registrationNumber"),
    vehicleType: text(data, "vehicleType"),
  };
  for (const field of optionalFields) {
    const value = text(data, field);
    if (value) body[field] = value;
  }
  return body;
}

export function updateVehiclePayload(vehicle: Vehicle, data: FormData): UpdateVehicleRequest {
  const patch: UpdateVehicleRequest = {};
  for (const field of requiredFields) {
    const value = text(data, field);
    if (value !== vehicle[field]) patch[field] = value;
  }
  for (const field of optionalFields) {
    const value = text(data, field) || null;
    if (value !== vehicle[field]) patch[field] = value;
  }
  return patch;
}
