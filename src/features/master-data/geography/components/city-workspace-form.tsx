'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {City} from '../types';
import {GeographyWorkspaceForm} from './geography-workspace-form';
export function CityWorkspaceForm({city,mode,authContext}:{city?:City|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <GeographyWorkspaceForm entity="cities" record={city} mode={mode} authContext={authContext}/>;
}
