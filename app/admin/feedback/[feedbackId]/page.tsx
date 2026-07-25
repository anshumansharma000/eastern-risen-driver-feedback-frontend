import { AdminFeedbackDetailView } from "@/components/admin-feedback-detail";
export default async function Page({params}:{params:Promise<{feedbackId:string}>}){const {feedbackId}=await params;return <main className="page"><AdminFeedbackDetailView feedbackId={feedbackId}/></main>}
