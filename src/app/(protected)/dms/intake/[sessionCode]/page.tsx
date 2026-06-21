import { getAiIntakeSession } from "@/server/actions/dms/ai-intake";
import { getDmsDocumentTypes } from "@/server/actions/dms/document-types";
import { DmsAiIntakePageClient } from "@/features/dms/intake/dms-ai-intake-page-client";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type IntakePageProps = {
  params: Promise<{ sessionCode: string }>;
};

export default async function DmsIntakePage({ params }: IntakePageProps) {
  const { sessionCode } = await params;

  const [result, docTypesResult] = await Promise.all([
    getAiIntakeSession(sessionCode),
    getDmsDocumentTypes({ is_active: true }),
  ]);

  if (!result.success || !result.data) {
    notFound();
  }

  const session = result.data;
  const documentTypes = docTypesResult.data ?? [];

  // If already approved — redirect to the final document
  if (session.intake_status === "approved" && session.document_id) {
    redirect(`/dms/documents/record/${session.document_id}`);
  }

  return <DmsAiIntakePageClient session={session} documentTypes={documentTypes} />;
}
