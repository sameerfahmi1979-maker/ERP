import type {LookupCategoryWithStats,LookupValueWithCategory} from './types';
import {sortingFns,type SortingFn} from '@tanstack/react-table';

/** Only text already displayed by these administrative columns is searchable. */
export const lookupCategorySearch=(row:Pick<LookupCategoryWithStats,'category_code'|'category_name_en'>)=>`${row.category_code} ${row.category_name_en}`;
export const lookupValueSearch=(row:Pick<LookupValueWithCategory,'value_code'|'value_label_en'>)=>`${row.value_code} ${row.value_label_en}`;
export const lookupValueCategorySearch=(row:Pick<LookupValueWithCategory,'category'>)=>row.category?`${row.category.category_code} ${row.category.category_name_en}`:'';

/** Search text must not make a label rename change code-column sorting. */
export function lookupCodeSorting<T>(code:(row:T)=>string):SortingFn<T>{
 return(a,b,id)=>sortingFns.alphanumeric({...a,getValue:()=>code(a.original) as never},{...b,getValue:()=>code(b.original) as never},id);
}
/** Category's original object accessor used basic ordering; keep that ordering
 * while exposing a scalar solely so the existing global search can find it. */
export const lookupCategorySorting:SortingFn<LookupValueWithCategory>=(a,b,id)=>sortingFns.basic(
 {...a,getValue:()=>a.original.category as never},{...b,getValue:()=>b.original.category as never},id);
