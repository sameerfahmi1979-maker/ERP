import { redirect } from 'next/navigation';
import { getAuthContext, hasPermission } from '@/lib/rbac/check';
import { CityWorkspaceForm } from '@/features/master-data/geography/components/city-workspace-form';
export const dynamic = 'force-dynamic'; export const revalidate = 0;
export default async function CityNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.geography.view')) redirect('/dashboard');
  if (!hasPermission(authContext, 'master_data.geography.manage')) redirect('/admin/master-data/geography/cities');
  return <div className='h-full'><CityWorkspaceForm mode='add' authContext={authContext} /></div>;
}
