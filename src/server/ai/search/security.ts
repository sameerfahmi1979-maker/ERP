import "server-only";
import {getAuthContext,type AuthContext} from "@/lib/rbac/check";
import {hrReadIdentity} from "@/lib/reads/hr-read-identity";
/** Delivery check is fresh; request-local cached admission is insufficient after revocation. */
export async function verifySearchDelivery(initial:AuthContext){
 const current=await getAuthContext();
 if(!current.profile||!current.isAccountActive||current.profile.must_change_password||hrReadIdentity(initial)!==hrReadIdentity(current))throw Error("Search access changed before delivery");
}
