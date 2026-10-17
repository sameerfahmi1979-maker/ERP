import 'server-only';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readBoundedDmsObject,verifyDmsBlob} from './dms-file-verification';
const identity=z.object({id:z.string().uuid(),version:z.string().min(1),lastModified:z.string().datetime({offset:true})});
/** Trusted provider input is the exact bounded, parsed byte array. A file name,
 * stored hash or successful extraction status alone is never byte evidence. */
export async function readVerifiedIntakeSource(storage:ReturnType<SupabaseClient['storage']['from']>,source:{
 path:string;name:string;mime:string;size:number;sha256:string|null;
}){
 const before=await storage.info(source.path),b=identity.safeParse(before.data);
 if(before.error||!b.success)throw Error('The original file identity is unavailable.');
 const blob=await readBoundedDmsObject(storage,source.path,source.size);
 const proof=await verifyDmsBlob(blob,source);
 const after=await storage.info(source.path),a=identity.safeParse(after.data);
 if(after.error||!a.success||JSON.stringify(b.data)!==JSON.stringify(a.data))throw Error('The original file changed during verification.');
 return {bytes:Buffer.from(await blob.arrayBuffer()),proof,object:a.data};
}
