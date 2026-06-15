import { redirect } from 'next/navigation';
import { getAuthContext, hasPermission } from '@/lib/rbac/check';
import { PortWorkspaceForm } from '@/features/master-data/geography/components/port-workspace-form';
export const dynamic = 'force-dynamic'; export const revalidate = 0;
export default async function PortNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.geography.view')) redirect('/dashboard');
  if (!hasPermission(authContext, 'master_data.geography.manage')) redirect('/admin/master-data/geography/ports');
  return <div className='h-full'><PortWorkspaceForm mode='add' authContext={authContext} /></div>;
}
