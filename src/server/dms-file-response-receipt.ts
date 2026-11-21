import "server-only";
/** Internal handoff to in-process callers; the HTTP response contains no audit identifiers. */
const receipts=new WeakMap<Response,number>();
export function retainFileResponseReceipt<T extends Response>(response:T,eventId:number):T {
 receipts.set(response,eventId);return response;
}
export function fileResponseReceipt(response:Response){return receipts.get(response);}
