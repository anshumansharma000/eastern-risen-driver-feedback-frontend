import { Suspense } from "react";
import { DriverTripDetailRoute } from "@/components/query-detail-routes";
import { LoadingCards } from "@/components/ui";

export default function Page() {
  return <Suspense fallback={<main className="page"><LoadingCards /></main>}><DriverTripDetailRoute /></Suspense>;
}
