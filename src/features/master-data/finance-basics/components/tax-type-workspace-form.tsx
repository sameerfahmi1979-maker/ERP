'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {TaxType} from '../types';
import {FinanceReferenceWorkspaceForm} from './finance-reference-workspace-form';
export function TaxTypeWorkspaceForm({taxType,mode,authContext}:{taxType?:TaxType|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <FinanceReferenceWorkspaceForm entity="tax_types" record={taxType} mode={mode} authContext={authContext}/>;
}
