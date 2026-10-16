'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {PaymentTerm} from '../types';
import {FinanceReferenceWorkspaceForm} from './finance-reference-workspace-form';
export function PaymentTermWorkspaceForm({paymentTerm,mode,authContext}:{paymentTerm?:PaymentTerm|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <FinanceReferenceWorkspaceForm entity="payment_terms" record={paymentTerm} mode={mode} authContext={authContext}/>;
}
