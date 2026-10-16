'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {Country} from '../types';
import {GeographyWorkspaceForm} from './geography-workspace-form';
export function CountryWorkspaceForm({country,mode,authContext}:{country?:Country|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <GeographyWorkspaceForm entity="countries" record={country} mode={mode} authContext={authContext}/>;
}
