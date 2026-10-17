import type {Currency} from '@/features/master-data/finance-basics/types';
import type {WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
export function currencyFormState(row?:Currency|null){
 return {currency_code:row?.currency_code??'',currency_name_en:row?.currency_name_en??'',currency_name_ar:row?.currency_name_ar??'',
  symbol:row?.symbol??'',decimal_places:String(row?.decimal_places??2),is_base_currency:row?.is_base_currency??false,
  description_en:row?.description_en??'',description_ar:row?.description_ar??'',notes:row?.notes??'',
  sort_order:String(row?.sort_order??0),is_active:row?.is_active??true};
}
export type CurrencyFormState=ReturnType<typeof currencyFormState>;
export const currencyDraftCodec:WorkspaceDraftCodec<CurrencyFormState>={
 encode:value=>Object.fromEntries(Object.entries(value).map(([key,v])=>[key,String(v)])),
 restore:(initial,read)=>Object.fromEntries(Object.entries(initial).map(([key,value])=>[key,typeof value==='boolean'?read(key,String(value))==='true':read(key,value)])) as CurrencyFormState,
};
