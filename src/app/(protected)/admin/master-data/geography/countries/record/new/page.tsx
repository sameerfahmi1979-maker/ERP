import { redirect } from 'next/navigation';
import { getAuthContext, hasPermission } from '@/lib/rbac/check';
import { CountryWorkspaceForm } from '@/features/master-data/geography/components/country-workspace-form';
export const dynamic = 'force-dynamic'; export const revalidate = 0;
export default async function CountryNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.geography.view')) redirect('/dashboard');
  if (!hasPermission(authContext, 'master_data.geography.manage')) redirect('/admin/master-data/geography/countries');
  return <div className='h-full'><CountryWorkspaceForm mode='add' authContext={authContext} /></div>;
}
