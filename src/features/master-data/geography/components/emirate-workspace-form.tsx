'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {Emirate} from '../types';
import {GeographyWorkspaceForm} from './geography-workspace-form';
export function EmirateWorkspaceForm({emirate,mode,authContext}:{emirate?:Emirate|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <GeographyWorkspaceForm entity="emirates" record={emirate} mode={mode} authContext={authContext}/>;
}
