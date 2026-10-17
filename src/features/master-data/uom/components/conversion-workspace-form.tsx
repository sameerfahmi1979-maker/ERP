'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {UomConversionWithUnits} from '../types';
import {UomWorkspaceForm} from './uom-workspace-form';
export function ConversionWorkspaceForm({conversion,...props}:{conversion?:UomConversionWithUnits|null;mode:'add'|'edit'|'view';authContext:AuthContext;onSuccess?:()=>void}){
 return <UomWorkspaceForm entity="uom_conversions" record={conversion} {...props}/>;
}
