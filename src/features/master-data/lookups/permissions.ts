import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission} from '@/lib/rbac/scope';
export function lookupCapabilities(ctx:AuthContext){
 const manage=hasGlobalPermission(ctx,'master_data.lookups.manage'),lock=hasGlobalPermission(ctx,'master_data.lookups.lock');
 return {read:manage||lock||hasGlobalPermission(ctx,'master_data.lookups.view'),manage,lock};
}
