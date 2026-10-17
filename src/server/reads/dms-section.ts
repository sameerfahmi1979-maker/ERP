import "server-only";
import { z } from "zod";
import {createClient} from "@/lib/supabase/server";
import { getReadAuthContext } from "./read-context";
import {listDmsApplyToErpRuns,getDmsApplyToErpRun} from "@/server/actions/dms/apply-to-erp";
import {getDmsExpiryReminders} from "@/server/actions/dms/expiry-reminders";
const id=z.number().int().positive();
import {getDmsDocumentComments} from "@/server/actions/dms/document-comments";
import {getDmsDocumentEvents} from "@/server/actions/dms/document-events";
import {getDmsDocumentLifecycle,getDmsDocumentHistoryPage} from "@/server/actions/dms/lifecycle-history";
import {getDmsDocumentFiles} from "@/server/actions/dms/document-files";
import {getDmsDocumentVersions} from "@/server/actions/dms/document-files";
import {getDmsDocumentLinks} from "@/server/actions/dms/document-links";
import {getDmsLinkSuggestions} from "@/server/actions/dms/ai-links";
import {getMetadataDefinitionsForType} from "@/server/actions/dms/document-metadata-values";
import {getDmsDocumentMetadataValues} from "@/server/actions/dms/document-metadata-values";
import {getDmsTags} from "@/server/actions/dms/tags";
import {getDmsDocumentTags} from "@/server/actions/dms/document-tags";
import {getDmsTagSuggestions} from "@/server/actions/dms/ai-tags";
import {getDmsOcrStatus} from "@/server/actions/dms/ocr";
import {getDmsOcrJobs} from "@/server/actions/dms/ocr";
import {getDmsFileOcrText} from "@/server/actions/dms/ocr";
import {getDocumentContentText} from "@/server/actions/dms/document-content";
import {getDmsAiAnalysisStatus} from "@/server/actions/dms/ai-analysis";
import {getDmsAiExtractionResults} from "@/server/actions/dms/ai-analysis";
import {getDmsAiMetadataApplyHistory} from "@/server/actions/dms/ai-analysis";
import {getApplyCorrectionAccess} from "@/server/actions/dms/apply-correction";
import {getDmsAiSummaryStatus} from "@/server/actions/dms/ai-summary";
import {getDmsDocumentCompletenessStatus} from "@/server/actions/dms/ai-completeness";
import {getDmsDocumentRiskStatus} from "@/server/actions/dms/ai-risk";
import {getDmsDocumentEmbeddingStatus} from "@/server/actions/dms/semantic-search";
import {getDmsDocumentSemanticIndexStatus} from "@/server/actions/dms/intelligence-admin";
import {getDmsDocumentUnderstanding} from "@/server/actions/dms/document-understanding";
import {getDmsErpMappingPreview} from "@/server/actions/dms/erp-mappings";
import {getEligibleUploadSessionsForVersionLink} from "@/server/actions/dms/document-upload-attach";
import {getDocumentApprovalState} from "@/server/actions/dms/document-approvals";
import {getDocumentApprovalHistory} from "@/server/actions/dms/document-approvals";

/** Explicit read-only allowlist: no writes, downloads, signed URLs or provider calls. */
export async function readDmsSection(input:unknown) {
 const base=z.object({kind:z.string(),args:z.array(z.unknown()).max(3)}).strict().safeParse(input);
 if(!base.success)return {success:false,error:"Invalid section read"};
 const ctx=await getReadAuthContext();
 if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password)return {success:false,error:"Permission denied"};
 const {kind,args}=base.data;
 const documentReads=new Set(["getDmsDocumentLifecycle","getDmsDocumentHistoryPage","getDmsDocumentComments","getDmsDocumentEvents","getDmsDocumentFiles","getDmsDocumentVersions","getDmsDocumentLinks","getDmsLinkSuggestions","getDmsDocumentMetadataValues","getDmsDocumentTags","getDmsTagSuggestions","getDmsOcrStatus","getDocumentContentText","getDmsAiAnalysisStatus","getDmsAiExtractionResults","getDmsAiMetadataApplyHistory","getDmsAiSummaryStatus","getDmsDocumentCompletenessStatus","getDmsDocumentRiskStatus","getDmsDocumentEmbeddingStatus","getDmsDocumentSemanticIndexStatus","getDmsDocumentUnderstanding","getDmsErpMappingPreview","getEligibleUploadSessionsForVersionLink","getDocumentApprovalState","getDocumentApprovalHistory"]);
 if(documentReads.has(kind)){
  const parsedId=id.safeParse(args[0]);if(!parsedId.success)return {success:false,error:"Invalid document identifier"};
  const db=await createClient();const parent=await db.from("dms_documents").select("id").eq("id",parsedId.data).is("deleted_at",null).maybeSingle();
  if(parent.error)return {success:false,error:"Document access unavailable"};
  if(!parent.data)return {success:false,error:"Permission denied"};
 }
 switch(kind){
 case "getDmsExpiryReminders": {const p=z.tuple([z.object({documentId:id}).strict()]).safeParse(args);return p.success?getDmsExpiryReminders(...p.data):{success:false,error:"Invalid section arguments"};}
 case "listDmsApplyToErpRuns": {const p=z.tuple([z.object({documentId:id.optional(),page:z.number().int().min(1).max(100000),pageSize:z.literal(20)}).strict()]).safeParse(args);return p.success?listDmsApplyToErpRuns(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsApplyToErpRun": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsApplyToErpRun(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentComments": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentComments(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentLifecycle": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentLifecycle(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentHistoryPage": {const p=z.tuple([id,z.number().int().min(1).max(100000),z.enum(["all","downloads"])]).safeParse(args);return p.success?getDmsDocumentHistoryPage(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentEvents": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentEvents(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentFiles": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentFiles(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentVersions": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentVersions(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentLinks": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentLinks(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsLinkSuggestions": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsLinkSuggestions(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getMetadataDefinitionsForType": {const p=z.tuple([id,z.enum(["all","intake","detail"]).optional(),id.optional()]).safeParse(args);return p.success?getMetadataDefinitionsForType(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentMetadataValues": {const p=z.tuple([id,id.optional()]).safeParse(args);return p.success?getDmsDocumentMetadataValues(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsTags": {const p=z.tuple([]).safeParse(args);return p.success?getDmsTags(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentTags": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentTags(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsTagSuggestions": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsTagSuggestions(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsOcrStatus": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsOcrStatus(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsOcrJobs": {const p=z.tuple([z.object({documentId:id,limit:z.literal(10),offset:z.literal(0)}).strict()]).safeParse(args);return p.success?getDmsOcrJobs(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsFileOcrText": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsFileOcrText(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDocumentContentText": {const p=z.tuple([id]).safeParse(args);return p.success?getDocumentContentText(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsAiAnalysisStatus": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsAiAnalysisStatus(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsAiExtractionResults": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsAiExtractionResults(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsAiMetadataApplyHistory": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsAiMetadataApplyHistory(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getApplyCorrectionAccess": {const p=z.tuple([]).safeParse(args);return p.success?getApplyCorrectionAccess(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsAiSummaryStatus": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsAiSummaryStatus(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentCompletenessStatus": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentCompletenessStatus(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentRiskStatus": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentRiskStatus(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentEmbeddingStatus": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentEmbeddingStatus(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentSemanticIndexStatus": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentSemanticIndexStatus(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsDocumentUnderstanding": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsDocumentUnderstanding(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDmsErpMappingPreview": {const p=z.tuple([id]).safeParse(args);return p.success?getDmsErpMappingPreview(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getEligibleUploadSessionsForVersionLink": {const p=z.tuple([id]).safeParse(args);return p.success?getEligibleUploadSessionsForVersionLink(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDocumentApprovalState": {const p=z.tuple([id]).safeParse(args);return p.success?getDocumentApprovalState(...p.data):{success:false,error:"Invalid section arguments"};}
 case "getDocumentApprovalHistory": {const p=z.tuple([id]).safeParse(args);return p.success?getDocumentApprovalHistory(...p.data):{success:false,error:"Invalid section arguments"};}
 default:return {success:false,error:"Invalid section read"};
 }
}
