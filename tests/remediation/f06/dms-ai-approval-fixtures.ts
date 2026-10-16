import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
export const operation='00000000-0000-4000-8000-000000000017';
export const contract:WorkspaceSaveContract={operationId:operation,revision:null};
export const input={uploadSessionId:17,title:'Synthetic reviewed document',documentTypeId:8,standardFileName:'Synthetic_Owner_123_NoExpiry.pdf',owningCompanyId:4,owningBranchId:5};
export const snapshot={source:{id:17,session_code:'S17',uploaded_by:11,owning_company_id:2,owning_branch_id:3,temp_storage_path:'synthetic.pdf',original_filename:'source.pdf',mime_type:'application/pdf',file_size_bytes:9,sha256_hash:null,ai_result_id:null},type:{id:8,category_id:9,type_code:'SYN',default_confidentiality:'internal' as const,requires_expiry_tracking:false},storage_year:2026,source_fingerprint:'a'.repeat(64),context_fingerprint:'b'.repeat(64),analysis_result_id:null,analysis_fingerprint:null};
export const prepared={...snapshot,content_sha256:'c'.repeat(64)};
export const receipt=(c:WorkspaceSaveContract=contract)=>({documentId:41,documentNo:'DMS-41',upload_session_id:17,operation_id:c.operationId,approve_run_id:51,file_id:61,completed:true as const,replayed:false});
export const plan={...receipt(),completed:false,file_id:null,reference_id:31,storage_path:'4/2026/SYN/41/v1/original.pdf',actor_id:11,auth_session_id:'00000000-0000-4000-8000-000000000011'};
