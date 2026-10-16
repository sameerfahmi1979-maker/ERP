'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {ProfitCenter} from '../types';
import {FinanceCenterWorkspaceForm} from './finance-center-workspace-form';
export function ProfitCenterWorkspaceForm({profitCenter,mode,authContext}:{profitCenter?:ProfitCenter|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <FinanceCenterWorkspaceForm entity="profit_centers" record={profitCenter} mode={mode} authContext={authContext}/>;
}
