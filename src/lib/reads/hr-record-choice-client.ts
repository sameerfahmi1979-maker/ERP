"use client";
import {readJson} from "./client";
import {hrRecordChoiceResult,type HrRecordChoiceKind} from "./hr-record-choices-schema";
import type {HrAccessCardTypeRow,HrIdentityDocTypeRow,HrMedicalRecordTypeRow,HrSettingsRow,HrTrainingTypeRow} from "@/server/actions/hr/settings";
type Options={selectedId?:number|null;signal?:AbortSignal};
async function choices<T extends {id:number}>(kind:HrRecordChoiceKind,options:Options={}){
 const selectedId=options.selectedId??null;
 const response=await readJson<{success:true;data:unknown}>("hr-record-choices",{kind,selectedId},options.signal);
 const data=hrRecordChoiceResult.parse(response.data);if(data.kind!==kind||data.selectedId!==selectedId)throw Error("Choice subject mismatch");
 return {success:true as const,data:{data:data.rows as unknown as T[],total:data.totalCount}};
}
export const listHrIdentityDocumentTypes=(p?:Options)=>choices<HrIdentityDocTypeRow>("identity-types",p);
export const listHrRelationshipTypes=(p?:Options)=>choices<HrSettingsRow>("relationships",p);
export const listHrAccessCardTypes=(p?:Options)=>choices<HrAccessCardTypeRow>("access-card-types",p);
export const listHrTrainingCategories=(p?:Options)=>choices<HrSettingsRow>("training-categories",p);
export const listHrTrainingTypes=(p?:Options)=>choices<HrTrainingTypeRow>("training-types",p);
export const listHrMedicalRecordTypes=(p?:Options)=>choices<HrMedicalRecordTypeRow>("medical-types",p);
