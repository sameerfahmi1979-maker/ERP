// @vitest-environment jsdom
import {render,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import type {ERPComboboxProps} from '@/components/erp/combobox';
const mock=vi.hoisted(()=>({query:vi.fn(),props:null as ERPComboboxProps|null}));
vi.mock('@/hooks/lookups',()=>({useBranchesQuery:mock.query}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:(props:ERPComboboxProps)=>{mock.props=props;return null;}}));
import {BranchSelect} from '@/components/erp/organizations/branch-select';
beforeEach(()=>{vi.clearAllMocks();mock.props=null;mock.query.mockReturnValue({options:[{value:4,label:'Legacy'}],isLoading:true,error:'stale legacy failure'});});afterEach(cleanup);
it('uses the existing shared query unchanged when no domain projection was supplied',()=>{render(<BranchSelect value={null} ownerCompanyId={1}/>);expect(mock.query).toHaveBeenCalledWith({ownerCompanyId:1,includeInactive:false,enabled:true,selectedId:null});expect(mock.props?.options[0].label).toBe('Legacy');expect(mock.props?.loading).toBe(true);});
it('uses authorized domain labels without running the legacy base-table query or inheriting its errors',()=>{const options=[{value:2,label:'Permitted branch'}];render(<BranchSelect value={2} ownerCompanyId={1} authorizedOptions={options}/>);expect(mock.query).toHaveBeenCalledWith({ownerCompanyId:1,includeInactive:false,enabled:false,selectedId:2});expect(mock.props?.options).toEqual([{...options[0],disabled:false}]);expect(mock.props?.loading).toBe(false);expect(mock.props?.error).toBeUndefined();});
it('an empty authorized catalogue must never fall back to cached broader choices',()=>{render(<BranchSelect value={null} ownerCompanyId={1} authorizedOptions={[]}/>);expect(mock.props?.options).toEqual([]);expect(mock.query.mock.calls[0][0].enabled).toBe(false);});
