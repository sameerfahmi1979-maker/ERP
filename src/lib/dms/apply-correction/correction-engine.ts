/** Compatibility entrypoints: no independent target/history/status writes. */
import {runDmsCorrection} from '@/server/dms-reviewed-updates';
import type {CreateCorrectionProposalInput,ApplyCorrectionInput,CorrectionResult} from './types';
export async function createCorrectionProposal(input:CreateCorrectionProposalInput,_userId:number,_profileId:number):Promise<CorrectionResult>{
 void _userId;void _profileId;
 const result=await runDmsCorrection('prepare',{originalApplyItemId:input.originalApplyItemId,requestId:input.requestId,snapshot:input.sourceSnapshot.reviewedSnapshot,mode:input.correctionMode,value:String(input.correctionValue.v)});
 return result.success&&result.data?{success:true,...result.data}:{success:false,error:'server_error',message:result.error??'Correction was not confirmed.'};
}
export async function executeCorrectionProposal(input:ApplyCorrectionInput,_userId:number,_profileId:number):Promise<CorrectionResult>{
 void _userId;void _profileId;
 const result=await runDmsCorrection('apply',{...input});
 return result.success&&result.data?{success:true,...result.data}:{success:false,error:'server_error',message:result.error??'Correction was not confirmed.'};
}
export async function cancelCorrectionProposal(proposalId:number,_userId:number,_profileId:number):Promise<CorrectionResult>{
 void _userId;void _profileId;
 const result=await runDmsCorrection('cancel',{proposalId});
 return result.success&&result.data?{success:true,...result.data}:{success:false,error:'server_error',message:result.error??'Cancellation was not confirmed.'};
}
