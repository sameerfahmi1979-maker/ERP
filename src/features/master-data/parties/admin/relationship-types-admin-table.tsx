"use client";
import type {AuthContext} from '@/lib/rbac/check';
import type {RelationshipTypeAdminRow} from '@/server/actions/master-data/party-admin-masters';
import {PartyAdminMasterTable} from './party-admin-master-table';
export function RelationshipTypesAdminTable(props:{rows:RelationshipTypeAdminRow[];authContext:AuthContext}){
 return <PartyAdminMasterTable entity="party_relationship_types" {...props}/>;
}
