import type { QuestionnairePurpose } from "./contracts.ts";

export const questionnairePurposes: QuestionnairePurpose[] = [
  "ARRIVAL_EXPERIENCE",
  "DRIVER_FEEDBACK",
  "TOUR_EXPERIENCE",
];

export const questionnairePurposeCopy: Record<QuestionnairePurpose, { label:string; help:string }> = {
  ARRIVAL_EXPERIENCE: {
    label: "Arrival and booking experience",
    help: "Normally collected during the passenger's first arrival or pickup trip.",
  },
  DRIVER_FEEDBACK: {
    label: "Driver feedback",
    help: "Normally collected after every trip.",
  },
  TOUR_EXPERIENCE: {
    label: "Tour coordination and experience",
    help: "Select this for the final trip in the booking.",
  },
};

export function feedbackPurposesFromForm(data: FormData): QuestionnairePurpose[] | undefined {
  if (data.get("feedbackSelectionMode") === "recommended") return undefined;
  const selected = new Set(data.getAll("feedbackPurposes").map(String));
  return questionnairePurposes.filter((purpose) => selected.has(purpose));
}

export function sameFeedbackPurposes(
  left: readonly QuestionnairePurpose[],
  right: readonly QuestionnairePurpose[],
) {
  return left.length === right.length && left.every((purpose) => right.includes(purpose));
}
