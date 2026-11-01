import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";
const cursor=z.strictObject({v:z.literal(1),offset:z.number().int().min(0).max(1000000),count:z.number().int().nonnegative().safe(),digest:z.string().regex(/^[a-f0-9]{64}$/),anchor:z.strictObject({id:z.number().int().positive().safe(),version:z.string().min(1).max(100)})});
export type SearchCursor=z.infer<typeof cursor>;
export function searchDigest(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
/** Continuation metadata, not an authorization token. Every page reruns current authority/filters. */
export function encodeSearchCursor(value:SearchCursor):string{return Buffer.from(JSON.stringify(cursor.parse(value)),"utf8").toString("base64url");}
export function decodeSearchCursor(value:string,digest:string):SearchCursor {
 try{if(value.length>1000||!/^[A-Za-z0-9_-]+$/.test(value))throw Error();const parsed=cursor.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));if(parsed.digest!==digest)throw Error();return parsed;}catch{throw Error("Invalid or stale search cursor; restart the search.");}
}
