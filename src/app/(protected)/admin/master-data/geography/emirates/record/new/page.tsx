import { redirect } from 'next/navigation';
import { getAuthContext, hasPermission } from '@/lib/rbac/check';
import { EmirateWorkspaceForm } from '@/features/master-data/geography/components/emirate-workspace-form';
export const dynamic = 'force-dynamic'; export const revalidate = 0;
export default async function EmirateNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.geography.view')) redirect('/dashboard');
  if (!hasPermission(authContext, 'master_data.geography.manage')) redirect('/admin/master-data/geography/emirates');
  return <div className='h-full'><EmirateWorkspaceForm mode='add' authContext={authContext} /></div>;
}
