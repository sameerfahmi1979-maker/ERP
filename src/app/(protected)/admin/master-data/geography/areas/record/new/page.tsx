import { redirect } from 'next/navigation';
import { getAuthContext, hasPermission } from '@/lib/rbac/check';
import { AreaWorkspaceForm } from '@/features/master-data/geography/components/area-workspace-form';
export const dynamic = 'force-dynamic'; export const revalidate = 0;
export default async function AreaNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.geography.view')) redirect('/dashboard');
  if (!hasPermission(authContext, 'master_data.geography.manage')) redirect('/admin/master-data/geography/areas');
  return <div className='h-full'><AreaWorkspaceForm mode='add' authContext={authContext} /></div>;
}
