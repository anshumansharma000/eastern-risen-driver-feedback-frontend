"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminDriverDetail } from "./admin-driver-detail";
import { AdminFeedbackDetailView } from "./admin-feedback-detail";
import { DriverTripDetail } from "./driver-trip-detail";
import { QuestionnaireEditor } from "./questionnaire-editor";
import { EmptyState } from "./ui";

export function AdminDriverDetailRoute() {
  const driverId = useRequiredParameter("driverId");
  return driverId
    ? <main className="page"><AdminDriverDetail driverId={driverId} /></main>
    : <MissingRecord title="Choose a driver" copy="Open a driver from the directory to view this page." href="/admin/drivers" label="Back to drivers" />;
}

export function AdminFeedbackDetailRoute() {
  const feedbackId = useRequiredParameter("feedbackId");
  return feedbackId
    ? <main className="page"><AdminFeedbackDetailView feedbackId={feedbackId} /></main>
    : <MissingRecord title="Choose a feedback record" copy="Open a response from the feedback list to view this page." href="/admin/feedback" label="Back to feedback" />;
}

export function QuestionnaireDetailRoute() {
  const questionnaireId = useRequiredParameter("questionnaireId");
  return questionnaireId
    ? <main className="page"><QuestionnaireEditor questionnaireId={questionnaireId} /></main>
    : <MissingRecord title="Choose a questionnaire" copy="Open a questionnaire version from the list to view this page." href="/admin/questionnaires" label="Back to questionnaires" />;
}

export function DriverTripDetailRoute() {
  const tripId = useRequiredParameter("tripId");
  return tripId
    ? <main className="page"><DriverTripDetail id={tripId} /></main>
    : <MissingRecord title="Choose a trip" copy="Open a journey from your trip list to view this page." href="/driver/trips" label="Back to journeys" />;
}

function useRequiredParameter(name: string): string | null {
  const value = useSearchParams().get(name)?.trim();
  return value || null;
}

function MissingRecord({ title, copy, href, label }: { title: string; copy: string; href: string; label: string }) {
  return <main className="page"><EmptyState title={title}>{copy}</EmptyState><p style={{ marginTop: "1rem" }}><Link className="button button-secondary" href={href}>{label}</Link></p></main>;
}
