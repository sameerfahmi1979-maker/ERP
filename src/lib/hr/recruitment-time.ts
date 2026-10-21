/** datetime-local has no timezone. Recruitment appointments use Dubai time,
 * independent of the operator's computer timezone. Preserve an untouched
 * original timestamp (including higher native precision) rather than silently
 * rescheduling it to a truncated minute. */
export function dubaiAppointmentInput(original:string|null){return original?new Date(Date.parse(original)+4*3600000).toISOString().slice(0,16):'';}
export function dubaiAppointmentValue(local:string,original:string|null=null){
 if(!local)return null;
 if(original&&local===dubaiAppointmentInput(original))return original;
 return`${local}${local.length===16?':00':''}+04:00`;
}
