'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {Bank} from '../types';
import {FinanceReferenceWorkspaceForm} from './finance-reference-workspace-form';
export function BankWorkspaceForm({bank,mode,authContext}:{bank?:Bank|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <FinanceReferenceWorkspaceForm entity="banks" record={bank} mode={mode} authContext={authContext}/>;
}
