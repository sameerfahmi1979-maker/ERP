import type { Metadata } from "next";
import { getPublicVerificationByToken } from "@/server/actions/reports/public-verification";
import { VerifyPageContent } from "./verify-page-content";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await getPublicVerificationByToken(token);
  const doc = result.data;

  return {
    title: doc
      ? `Verify: ${doc.document_title}`
      : "Document Verification",
    description: doc
      ? `Verify the authenticity of ${doc.document_title}`
      : "Document verification page",
    robots: { index: false, follow: false },
  };
}

export default async function VerifyTokenPage({ params }: PageProps) {
  const { token } = await params;
  const result = await getPublicVerificationByToken(token);

  return (
    <VerifyPageContent
      token={token}
      result={result.data ?? null}
    />
  );
}
