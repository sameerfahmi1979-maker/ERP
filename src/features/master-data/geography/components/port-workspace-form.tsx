'use client';
import type {AuthContext} from '@/lib/rbac/check';
import type {Port} from '../types';
import {GeographyWorkspaceForm} from './geography-workspace-form';
export function PortWorkspaceForm({port,mode,authContext}:{port?:Port|null;mode:'add'|'edit'|'view';authContext:AuthContext}){
 return <GeographyWorkspaceForm entity="ports" record={port} mode={mode} authContext={authContext}/>;
}
