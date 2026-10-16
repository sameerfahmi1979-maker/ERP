/** Only rendered, editable fields are submitted. Omitted controls never clear
 * historical hierarchy, display, dates or metadata as a side effect of editing. */
export function categoryFormPayload(form:FormData,create:boolean):Record<string,unknown>{
 const data:Record<string,unknown>={};
 if(create)data.category_code=String(form.get('category_code')??'').trim().toUpperCase();
 for(const key of ['category_name_en','category_name_ar','description','module_code','category_scope'])if(form.has(key))data[key]=form.get(key)===''&&key!=='category_name_en'?null:form.get(key);
 for(const key of ['supports_hierarchy','supports_color','supports_icon','supports_effective_dates','supports_metadata','is_active'])data[key]=form.get(key)==='on';
 if(form.has('sort_order'))data.sort_order=Number(form.get('sort_order'));
 return data;
}
export function valueFormPayload(form:FormData,create:boolean):Record<string,unknown>{
 const data:Record<string,unknown>={is_active:form.get('is_active')==='on'};
 if(create)data.value_code=String(form.get('value_code')??'').trim().toUpperCase();
 for(const key of ['value_label_en','value_label_ar','description','color_hex','icon_name','badge_variant','effective_from','effective_to'])if(form.has(key)){
  const value=form.get(key);data[key]=value===''||value==='__none'?null:value;
 }
 if(form.has('sort_order'))data.sort_order=Number(form.get('sort_order'));
 if(form.has('parent_value_id'))data.parent_value_id=form.get('parent_value_id')===''?null:Number(form.get('parent_value_id'));
 if(form.has('metadata_json')){
  const raw=String(form.get('metadata_json')??'').trim();
  const metadata:unknown=raw?JSON.parse(raw):{};
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw new Error('Metadata must be a JSON object.');
  data.metadata_json=metadata;
 }
 return data;
}
