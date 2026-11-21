import {z} from "zod";
import {rpc} from "./access";
import type {OrdinaryOriginal} from "./contracts";
import {tokenHash} from "./sharing";

export async function lookupReceipt(original:OrdinaryOriginal) {
 const {op,...data}=original;
 const commands={
  documentCommentAdd:"comment/add",documentCommentEdit:"comment/edit",documentCommentDelete:"comment/delete",
  documentMetadataSave:"metadata/save",documentTagsChange:"tags/change",documentShareCreate:"share/create",
  documentShareRevoke:"share/revoke",documentSavedFilterSave:"filter/save_filter",documentSavedFilterDelete:"filter/delete_filter",
 };
 const command=op==="documentRequestCreate"?"request/create/"+original.kind:op==="documentRequestAct"?"request/act/"+original.kind:commands[op];
 let payload:Record<string,unknown>=data;
 if("token" in data){const {token,...binding}=data;payload={...binding,tokenHash:tokenHash(token)};}
 const found=await rpc("mobile_dms_receipt",{p_command:command,p_data:payload},z.boolean());
 return {operationId:original.operationId,command:op,state:found?"confirmed":"unconfirmed"};
}
