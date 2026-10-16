'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {CostCenter} from '../types';
import {FinanceCenterWorkspaceForm} from './finance-center-workspace-form';
export function CostCenterWorkspaceForm({costCenter,mode,authContext}:{costCenter?:CostCenter|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <FinanceCenterWorkspaceForm entity="cost_centers" record={costCenter} mode={mode} authContext={authContext}/>;
}
