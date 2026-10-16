'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {AreaZone} from '../types';
import {GeographyWorkspaceForm} from './geography-workspace-form';
export function AreaWorkspaceForm({area,mode,authContext}:{area?:AreaZone|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <GeographyWorkspaceForm entity="areas_zones" record={area} mode={mode} authContext={authContext}/>;
}
