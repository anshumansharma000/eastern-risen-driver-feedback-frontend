import { AdminOperationalOverview } from "@/components/admin-timeline";
import { AdminAnalyticsView } from "@/components/admin-analytics";
export default function AdminPage(){return <main className="page"><AdminAnalyticsView summary={<AdminOperationalOverview compact/>}/></main>}
