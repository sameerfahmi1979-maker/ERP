'use client';
import{useCallback,useEffect,useId,useLayoutEffect,useRef,useState}from'react';import{useQuery}from'@tanstack/react-query';
import{ERPChildDialogForm}from'@/components/erp/erp-child-dialog-form';import{ERPCombobox}from'@/components/erp/combobox';
import{BankSelect}from'@/components/erp/finance-basics/bank-select';import{Button}from'@/components/ui/button';import{Input}from'@/components/ui/input';import{Label}from'@/components/ui/label';import{Textarea}from'@/components/ui/textarea';
import{Switch}from'@/components/ui/switch';
import{useBanksQuery}from'@/hooks/lookups';import{useReadLifetime}from'@/hooks/use-read-lifetime';
import{PayrollChoicePicker}from'@/features/hr/payroll/payroll-choice-picker';import{canUseHrChild}from'@/lib/hr/child-authority';import{hrReadIdentity}from'@/lib/reads/hr-read-identity';
import type{PayrollChildKind}from'@/lib/hr/payroll-child-contract';import{childOperationValues,type ChildMutation,type ChildReceipt}from'@/lib/hr/child-save-contract';import type{AuthContext}from'@/lib/rbac/check';
import{readPayrollChildOpening}from'@/server/actions/hr/child-mutation';import{useHrChildSession}from'./use-hr-child-session';import{PAYROLL_EDITORS,type PayrollField}from'./payroll-editor-spec';
import{payrollToday}from'@/lib/hr/payroll/salary-as-of';
type Target={id:number|null;action:'create'|'update'|'archive'|'release'};
type Props={kind:PayrollChildKind;employeeId:number;authContext:AuthContext;target:Target;currentBasic?:number|null;canDispatch:()=>boolean;blocked:boolean;retry:()=>void;onClose:()=>void;onSaved:(r:ChildReceipt,request:ChildMutation)=>void;onDenied?:()=>void};
export function PayrollRecordEditor(props:Props){return <Opening key={`${props.kind}:${props.employeeId}:${hrReadIdentity(props.authContext)}:${props.target.id??'new'}:${props.target.action}`} {...props}/>;}
function Opening(props:Props){
 const{kind,employeeId,authContext,target}=props,identity=hrReadIdentity(authContext),actor=`${authContext.profile?.id??'none'}:${authContext.profile?.auth_user_id??'none'}`,owner=useReadLifetime(`${identity}:${employeeId}:${kind}:${target.id??'new'}`),session=useHrChildSession(actor,identity,employeeId,kind);
 const[pendingAtOpen]=useState(()=>{if(!session.pending&&!session.retired)session.startNew();return session.pending?.request??null;}),[token]=useState(()=>crypto.randomUUID()),permitted=canUseHrChild(authContext,kind);
 const query=useQuery({queryKey:['hr','f11-payroll-opening',identity,employeeId,kind,target,token],enabled:owner.enabled&&permitted&&!pendingAtOpen&&!session.retired,staleTime:Infinity,gcTime:0,retry:false,refetchOnMount:false,refetchOnWindowFocus:false,refetchOnReconnect:false,queryFn:async()=>{
  if(!owner.active)throw Error('Opening retired.');const r=await readPayrollChildOpening(kind,employeeId,target.id,target.action);if(!owner.active)throw Error('Opening retired.');if(r.denied)props.onDenied?.();
  if(!r.success||r.id===undefined||r.revision===undefined||!r.values||r.id===null&&r.revision!==null||r.id!==null&&(r.revision===null||!/^[1-9]\d*$/.test(r.revision)))throw Error(r.error??'The complete original payroll opening could not be verified.');return r;
 }});
 if(!owner.enabled&&(!permitted||session.retired||!pendingAtOpen&&!query.data))return null;
 const close=()=>{if(owner.active&&!session.pending&&!session.busy)props.onClose();};
 if(!permitted||session.retired)return <ERPChildDialogForm open title="Payroll access changed"mode="view"onOpenChange={open=>{if(!open)close();}}><p role="alert">Current payroll and separate banking access are required. Earlier uncertain changes need a receipt check, not a new request.</p></ERPChildDialogForm>;
 if(!pendingAtOpen&&!query.data)return <ERPChildDialogForm open title={`Open ${PAYROLL_EDITORS[kind].title}`}mode="view"onOpenChange={open=>{if(!open)close();}}>{query.isError?<><p role="alert">{query.error.message}</p><Button type="button"onClick={()=>void query.refetch()}disabled={query.isFetching}>Retry payroll opening</Button></>:<p role="status">Checking the complete current payroll record…</p>}</ERPChildDialogForm>;
 const original:ChildMutation=pendingAtOpen??{kind,employeeId,id:query.data!.id!,revision:query.data!.revision!,action:target.action==='create'&&query.data!.id!==null?'update':target.action,values:query.data!.values!};
 return <Editor {...props}session={session}original={original}/>;
}
/** Salary/bank values are local to the mounted form, not saved as a reusable
 * workspace field draft or persisted to disk. Only a dispatched unchanged request
 * is retained in account-owned volatile recovery memory; retirement strips it. */
function Editor({session,original,...props}:Props&{session:ReturnType<typeof useHrChildSession>;original:ChildMutation}){
 const[opening]=useState(()=>structuredClone(original)),spec=PAYROLL_EDITORS[props.kind],confirmation=['archive','release'].includes(opening.action),owner=useReadLifetime(`${hrReadIdentity(props.authContext)}:${props.employeeId}:${props.kind}:ready`),id=useId();
 const[initial]=useState(()=>{const values=Object.fromEntries(spec.fields.map(field=>[field.name,opening.values[field.name]??field.defaultValue??(field.type==='checkbox'?false:field.type==='date'&&!field.nullable?payrollToday():'')]));return()=>values;});
 const[form,setForm]=useState<Record<string,unknown>>(initial),[clearBank,setClearBank]=useState({account_number:false,iban:false}),[message,setMessage]=useState<string|null>(null),[errors,setErrors]=useState<Record<string,string>>({}),[choices,setChoices]=useState<Record<string,boolean>>(()=>Object.fromEntries(confirmation?[]:spec.fields.filter(f=>['choice','bank'].includes(f.type)).map(f=>[f.name,true])));
 const choiceStatus=useCallback((key:string,blocked:boolean)=>setChoices(previous=>previous[key]===blocked?previous:{...previous,[key]:blocked}),[]);
 const locked=session.busy||session.pending!==null||session.blocked||session.receipt!==null,blocked=props.blocked||Object.values(choices).some(Boolean);
 const dispatchEpoch={},currentEpoch=useRef(dispatchEpoch);useLayoutEffect(()=>{currentEpoch.current=dispatchEpoch;});
 const submit=async()=>{
  if(currentEpoch.current!==dispatchEpoch||!owner.active||!props.canDispatch()||blocked||session.blocked||session.receipt)return;
  const raw:Record<string,unknown>=confirmation?{}:Object.fromEntries(spec.fields.flatMap(field=>{const value=form[field.name];if(props.kind==='wps-profile'&&['account_number','iban'].includes(field.name)){const key=field.name as keyof typeof clearBank;return clearBank[key]?[[field.name,null]]:String(value??'').trim()?[[field.name,String(value).trim()]]:[];}return[[field.name,field.type==='checkbox'?value===true:['number','choice','bank'].includes(field.type)?String(value??'')===''&&field.nullable?null:Number(value):field.nullable&&String(value??'')===''?null:String(value??'')]];}));
  if(props.kind==='salary-revision'&&!confirmation)raw.fingerprint=opening.values.fingerprint;
  // Empty numeric inputs are required errors, never implicit zero salaries.
  const missing=Object.fromEntries(spec.fields.filter(f=>!confirmation&&f.required&&String(form[f.name]??'').trim()==='').map(f=>[f.name,`${f.label} is required.`]));
  const parsed=childOperationValues(props.kind,opening.action).safeParse(raw);if(Object.keys(missing).length||!parsed.success){setErrors({...missing,...(!parsed.success?Object.fromEntries(parsed.error.issues.map(issue=>[issue.path.join('.'),issue.message])):{})});setMessage('Check the highlighted payroll fields before saving.');return;}
  const command=session.pending?.request??{...opening,values:parsed.data};const result=await session.submit(command);if(!owner.active)return;
  if(result.accessDenied){session.retireForLater();props.onDenied?.();return;}
  if(!result.success||!result.data){setMessage(result.error??'The payroll outcome remains unconfirmed.');return;}
  setForm({});setClearBank({account_number:false,iban:false});try{props.onSaved(result.data,command);props.onClose();}catch{setMessage('Payroll change committed. Reopen the latest permitted list before another change.');}
 };
 const close=()=>{if(owner.active&&!session.pending&&!session.busy){setForm({});props.onClose();}};
 if(!owner.enabled)return null;
 return <ERPChildDialogForm open title={`${opening.action==='archive'?'Archive':opening.action==='release'?'Release':opening.id?'Edit':props.kind==='salary-revision'?'Record':props.kind==='payroll-hold'?'Place':['payroll-profile','wps-profile'].includes(props.kind)?'Setup':'Add'} ${spec.title}`}mode={opening.id?'edit':'add'}size="lg"isDirty={!confirmation&&(JSON.stringify(form)!==JSON.stringify(initial())||Object.values(clearBank).some(Boolean))}isSubmitting={session.busy}closeDisabled={session.pending!==null||session.busy}submitDisabled={blocked||session.blocked||session.receipt!==null}submitLabel={session.pending?'Retry unchanged payroll change':confirmation?`${opening.action==='archive'?'Archive':'Release'} ${spec.noun}`:`Save ${spec.noun}`}onSubmit={submit}onOpenChange={open=>{if(!open)close();}}recoveryActions={session.pending&&<Button type="button"variant="outline"onClick={()=>{if(session.retireForLater()){setForm({});setClearBank({account_number:false,iban:false});props.onClose();}}}>Close and check later</Button>}>
  {(message||session.error)&&<p role="alert">{message??session.error}</p>}
  {props.kind==='salary-revision'&&<div><Label>Current Basic (profile currency)</Label><Input aria-label="Current Basic (profile currency)"readOnly disabled value={props.currentBasic===null||props.currentBasic===undefined?'Unavailable':props.currentBasic.toLocaleString('en-AE',{minimumFractionDigits:2,maximumFractionDigits:2})}/><p className="text-xs text-muted-foreground">Uses the recorded payroll-profile currency. Saving records a proposal only: a different authorized payroll manager must approve it, then an authorized manager must explicitly apply it on or after its effective date. No salary components or historical revision rows are overwritten.</p></div>}
  {Object.keys(errors).length>0&&<div role="alert"className="rounded border border-destructive p-3"><p>Check {Object.keys(errors).length} fields before saving</p><ul>{Object.entries(errors).map(([key,error])=><li key={key}><a href={`#${id}-${key}`}onClick={event=>{event.preventDefault();document.getElementById(`${id}-${key}`)?.focus();}}>{spec.fields.find(f=>f.name===key)?.label??key}: {error}</a></li>)}</ul></div>}
  {props.blocked&&<div><p role="alert">The current payroll list is unavailable. Your mounted form is retained; retry before saving.</p><Button type="button"variant="outline"onClick={props.retry}>Retry current payroll list</Button></div>}
  {confirmation?<p>Confirm {opening.action} of the original {spec.noun} #{opening.id}. History is retained; this does not cancel any uncertain earlier operation.</p>:<div className="grid grid-cols-1 gap-4 md:grid-cols-2">{spec.fields.map(field=><div key={field.name}className={field.type==='textarea'?'md:col-span-2':undefined}><Label htmlFor={`${id}-${field.name}`}>{field.label}{field.required?' *':''}</Label><Field field={field}id={`${id}-${field.name}`}employeeId={props.employeeId}value={form[field.name]}disabled={locked||props.kind==='wps-profile'&&clearBank[field.name as keyof typeof clearBank]===true}onValue={value=>{if(!locked&&owner.active)setForm(previous=>({...previous,[field.name]:value}));}}onChoiceStatus={choiceStatus}invalid={!!errors[field.name]}/>{errors[field.name]&&<p className="text-sm text-destructive">{errors[field.name]}</p>}{props.kind==='wps-profile'&&['account_number','iban'].includes(field.name)&&<><p className="text-xs text-muted-foreground">Leave blank to keep the recorded value. Existing numbers are never prefilled.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox"checked={clearBank[field.name as keyof typeof clearBank]}disabled={locked}onChange={event=>setClearBank(previous=>({...previous,[field.name]:event.target.checked}))}/>Clear existing {field.label.toLowerCase()}</label></>}</div>)}</div>}
 </ERPChildDialogForm>;
}
function Field({field,id,employeeId,value,disabled,onValue,onChoiceStatus,invalid}:{field:PayrollField;id:string;employeeId:number;value:unknown;disabled:boolean;onValue:(v:unknown)=>void;onChoiceStatus:(key:string,blocked:boolean)=>void;invalid:boolean}){
 const report=useCallback((blocked:boolean)=>onChoiceStatus(field.name,blocked),[field.name,onChoiceStatus]);
 if(field.type==='choice')return <PayrollChoicePicker kind={field.choice!}employeeId={employeeId}value={String(value??'')===''?null:Number(value)}onValueChange={onValue}enabled={!disabled}onReadState={report}ariaLabel={field.label}required={field.required}/>;
 if(field.type==='bank')return <BankField value={String(value??'')===''?null:Number(value)}disabled={disabled}onValue={onValue}report={report}/>;
 if(field.type==='select')return <ERPCombobox ariaLabel={field.label}value={String(value??'')}options={(field.options??[]).map(v=>({value:v,label:v.replaceAll('_',' ')}))}disabled={disabled}onValueChange={onValue}/>;
 if(field.type==='checkbox')return <Switch id={id}aria-label={field.label}checked={value===true}disabled={disabled}onCheckedChange={onValue}/>;
 if(field.type==='textarea')return <Textarea id={id}aria-label={field.label}aria-invalid={invalid}value={String(value??'')}disabled={disabled}maxLength={field.maxLength}onChange={event=>onValue(event.target.value)}/>;
 return <Input id={id}aria-label={field.label}aria-invalid={invalid}type={field.type==='number'?'number':field.type}step={field.type==='number'?'0.01':undefined}min={field.type==='number'?0:undefined}value={String(value??'')}disabled={disabled}maxLength={field.maxLength}required={field.required}onChange={event=>onValue(event.target.value)}/>;
}
function BankField({value,disabled,onValue,report}:{value:number|null;disabled:boolean;onValue:(v:unknown)=>void;report:(blocked:boolean)=>void}){
 const read=useBanksQuery({countryId:undefined,includeInactive:false,selectedId:value});
 // BankSelect shares the same existing lookup cache; this observer adds admission,
 // not another authority path or a fallback empty list.
 const blocked=read.isLoading||!!read.error;
 useEffect(()=>report(blocked),[blocked,report]);
 return <BankSelect value={value}disabled={disabled||blocked}onValueChange={onValue}allowClear/>;
}
