// @vitest-environment jsdom
// Real selectors/comboboxes; only existing read hooks are controlled doubles.
import '../f05/setup';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({options:[] as {value:number;label:string}[],error:null as string|null,read:vi.fn()}));
vi.mock('@/hooks/lookups',()=>{
 const read=(args:unknown)=>{m.read(args);return {options:m.options,error:m.error,isLoading:false};};
 return {useCountriesQuery:read,useEmiratesQuery:read,useCitiesQuery:read,useAreasQuery:read};
});
import {CountrySelect,EmirateSelect,CitySelect,AreaZoneSelect} from '@/components/erp/geography';
const selectors=[
 ['country',CountrySelect,{}],['region',EmirateSelect,{countryId:1}],
 ['city',CitySelect,{emirateId:1}],['area',AreaZoneSelect,{cityId:1}],
] as const;
beforeEach(()=>{m.options=[];m.error=null;vi.clearAllMocks();});afterEach(cleanup);
for(const [name,Selector,parent] of selectors){
 it(`${name}: retained authorized label stays visible without making an inactive option selectable`,()=>{
  const changed=vi.fn();render(<Selector {...parent} value={27} savedSelection={{value:27,label:'Historical synthetic'}} onValueChange={changed}/>);
  expect(screen.getByRole('combobox').textContent).toContain('Historical synthetic (saved selection)');
  fireEvent.click(screen.getByRole('combobox'));
  expect(screen.getByRole('option',{name:/Historical synthetic/}).getAttribute('aria-disabled')).toBe('true');
  expect(changed).not.toHaveBeenCalled();expect(m.read).toHaveBeenCalledWith(expect.objectContaining({includeInactive:false}));
 });
 it(`${name}: changing selection removes the old fallback; active catalogue label takes precedence`,()=>{
  m.options=[{value:27,label:'Current authorized label'},{value:28,label:'New active choice'}];
  const {rerender}=render(<Selector {...parent} value={27} savedSelection={{value:27,label:'Stale label'}}/>);
  expect(screen.getByRole('combobox').textContent).toContain('Current authorized label');
  rerender(<Selector {...parent} value={28} savedSelection={{value:27,label:'Stale label'}}/>);
  expect(screen.getByRole('combobox').textContent).toContain('New active choice');expect(screen.queryByText(/Stale label/)).toBeNull();
 });
 it(`${name}: a failed read retains the authorized saved value and shows a safe error`,()=>{
  m.error='PRIVATE SQL CONNECTION DETAIL';render(<Selector {...parent} value={27} savedSelection={{value:27,label:'Historical synthetic'}}/>);
  expect(screen.getByRole('combobox').textContent).toContain('Historical synthetic (saved selection)');
  expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText(/could not be loaded/i)).not.toBeNull();
  expect(screen.queryByText('PRIVATE SQL CONNECTION DETAIL')).toBeNull();
 });
 it(`${name}: a saved label is not disclosed for another ID or a new blank record`,()=>{
  const {rerender}=render(<Selector {...parent} value={28} savedSelection={{value:27,label:'Old record label'}}/>);
  expect(screen.queryByText(/Old record label/)).toBeNull();
  rerender(<Selector {...parent} value={null} savedSelection={{value:27,label:'Old record label'}}/>);
  expect(screen.queryByText(/Old record label/)).toBeNull();
 });
}
