'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {UomCategory} from '../types';
import {UomWorkspaceForm} from './uom-workspace-form';
export function UomCategoryWorkspaceForm({category,...props}:{category?:UomCategory|null;mode:'add'|'edit'|'view';authContext:AuthContext;onSuccess?:()=>void}){
 return <UomWorkspaceForm entity="uom_categories" record={category} {...props}/>;
}
