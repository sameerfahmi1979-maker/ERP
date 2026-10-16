"use client";
import type {AuthContext} from '@/lib/rbac/check';
import type {ServiceCategoryAdminRow} from '@/server/actions/master-data/party-admin-masters';
import {PartyAdminMasterTable} from './party-admin-master-table';
export function ServiceCategoriesAdminTable(props:{rows:ServiceCategoryAdminRow[];authContext:AuthContext}){
 return <PartyAdminMasterTable entity="party_service_categories_master" {...props}/>;
}
