import { AdminDriverDetail } from "@/components/admin-driver-detail";
export default async function Page({ params }: { params: Promise<{ driverId: string }> }) {
  const { driverId } = await params;
  return <main className="page"><AdminDriverDetail driverId={driverId} /></main>;
}
