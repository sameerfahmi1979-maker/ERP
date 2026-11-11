/** Session records are reserved before file transfer; uploaded is not proof of bytes. */
export function batchIntakeProgress(status:string,hasDocument=false){
 if(hasDocument)return {label:'Draft ready',value:100};
 switch(status){
  case 'uploaded': return {label:'Waiting for upload / AI start',value:0};
  case 'ocr_pending':return {label:'Waiting for OCR',value:25};
  case 'ocr_processing':return {label:'Reading file (OCR)',value:40};
  case 'ocr_complete':case 'ai_pending':return {label:'Waiting for AI analysis',value:55};
  case 'ai_processing':return {label:'AI analysis running',value:70};
  case 'ai_complete':case 'review_pending':case 'review_in_progress':return {label:'Analysis ready; draft confirmation required',value:85};
  case 'failed':return {label:'Failed — recovery required',value:0};
  case 'discarded':return {label:'Discarded',value:0};
  case 'cancelled':case 'expired':return {label:'Closed — reconcile original batch',value:0};
  default:return {label:'Status unavailable — refresh before continuing',value:0};
 }
}
