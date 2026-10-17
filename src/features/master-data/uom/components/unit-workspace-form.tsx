'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {UnitOfMeasureWithCategory} from '../types';
import {UomWorkspaceForm} from './uom-workspace-form';
export function UnitWorkspaceForm({unit,...props}:{unit?:UnitOfMeasureWithCategory|null;mode:'add'|'edit'|'view';authContext:AuthContext;onSuccess?:()=>void}){
 return <UomWorkspaceForm entity="units_of_measure" record={unit} {...props}/>;
}
