"use client";

import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {ERPCombobox} from '@/components/erp/combobox';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {useReportTemplateSelection} from '@/hooks/use-report-template-selection';
import {previewOfficialDocument} from '@/server/actions/output/preview-official-document';
import {EMPLOYMENT_RECIPIENT_FIELDS,employmentRecipientError} from '@/lib/official-documents/employment-recipient';
import type {AuthContext} from '@/lib/rbac/check';
import type {EmployeeOutputCatalogItem} from '@/server/actions/output/output-catalog';
import type {OfficialDocumentLanguage} from '@/lib/official-documents/types';
import {HR_LETTER_SELECTIONS} from '@/lib/official-documents/hr-source-contract';
import {HrLetterReviewPanel} from './hr-letter-review-panel';
import type {LetterReviewRequest} from '@/lib/official-documents/hr-source-review';
import {HrLetterSourceSelector} from './hr-letter-source-selector';
import {wordingReviewInputValues} from '@/lib/official-documents/wording-review-sample';

interface Props {
  authContext:AuthContext;employeeId:number;item:EmployeeOutputCatalogItem;onOpenChange:(open:boolean)=>void;
  onIssue?:(language:OfficialDocumentLanguage,inputs:Record<string,string>,templateId?:number)=>Promise<void>;
  isIssuing?:boolean;issueFeedback?:{kind:string;title:string;message:string}|null;
}

/** Shared preparation surface. Settings changes never issue a document. */
export function EmploymentLetterWorkbench({authContext,employeeId,item,onOpenChange,onIssue,isIssuing=false,issueFeedback}:Props) {
  const confirmation=item.outputCode==='HR_EMPLOYMENT_CONFIRMATION';
  const initialSample=!confirmation&&(item.wordingStatus==='draft'||item.sourceWorkflowPending===true);
  const initialInputs=(sample:boolean):Record<string,string>=>confirmation?{recipient_mode:'general',employee_title:''}:Object.fromEntries((item.optionalInputs??[]).flatMap(field=>{
    const value=sample?wordingReviewInputValues[field.key]:field.defaultValue;
    return value?[[field.key,value]]:[];
  }));
  const owner=useReadCacheOwner(),ownerRef=useRef(owner);
  useLayoutEffect(()=>{ownerRef.current=owner;},[owner]);
  const alive=useRef(false),flight=useRef<Promise<void>|null>(null),flightRevision=useRef<string|null>(null);
  const attemptedRevision=useRef<string|null>(null);
  const [language,setLanguage]=useState<OfficialDocumentLanguage>(item.previewLanguages?.[0]??'en');
  const [wordingReview,setWordingReview]=useState(initialSample);
  const [inputs,setInputs]=useState<Record<string,string>>(()=>initialInputs(initialSample));
  const [templateId,setTemplateId]=useState<number|null>(null);
  const [reviewPending,setReviewPending]=useState(false),[reviewDirty,setReviewDirty]=useState(false);
  const [busy,setBusy]=useState(false),[issueFlight,setIssueFlight]=useState(false);
  const issuing=useRef(false);
  const [error,setError]=useState<{revision:string;message:string}|null>(null);
  const [pdf,setPdf]=useState<{url:string;revision:string;notice:string}|null>(null);
  const templates=useReportTemplateSelection(authContext,{ownerCompanyIds:item.ownerCompanyId?[item.ownerCompanyId]:undefined,
    issuableOnly:true,selectedId:templateId,enabled:item.canBrandingOverride,generation:JSON.stringify([employeeId,item.outputCode])});
  const requiredInput=(item.optionalInputs??[]).find(field=>field.required&&!inputs[field.key]?.trim());
  const inputError=confirmation?employmentRecipientError(inputs,language):requiredInput?`Enter ${requiredInput.labelEn}.`:null;
  const selectionReady=templateId===null||!!templates.getSelectedNow();
  const canPreview=!reviewPending&&item.canPreview===true&&!inputError&&selectionReady;
  const revision=JSON.stringify([employeeId,item.outputCode,language,inputs,templateId,wordingReview]);
  const latest=useRef({revision,language,inputs,templateId,canPreview,wordingReview});
  useLayoutEffect(()=>{latest.current={revision,language,inputs,templateId,canPreview,wordingReview};if(!canPreview)attemptedRevision.current=null;},[revision,language,inputs,templateId,canPreview,wordingReview]);
  useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf.url);},[pdf]);
  const issued=issueFeedback?.kind==='success';
  const locked=isIssuing||issueFlight||issued;

  const refresh=async()=>{
    const request=latest.current;
    const current=()=>alive.current&&ownerRef.current?.isLive()!==false&&latest.current.revision===request.revision&&latest.current.canPreview;
    if(!request.canPreview||!current())return;
    if(flightRevision.current===request.revision&&flight.current)return flight.current;
    attemptedRevision.current=request.revision;
    const previous=flight.current;
    if(previous)await previous;
    if(!current())return;
    if(flightRevision.current===request.revision&&flight.current)return flight.current;
    setBusy(true);setError(null);flightRevision.current=request.revision;
    const job=(async()=>{
      try{
        const result=await previewOfficialDocument({outputCode:item.outputCode,employeeId,language:request.language,inputs:request.inputs,
          ...(request.templateId?{templateId:request.templateId}:{}),...(request.wordingReview?{wordingReview:true}:{})});
        if(!current())return;
        if(!result.success){setError({revision:request.revision,message:result.error});return;}
        const bytes=Uint8Array.from(atob(result.pdfBase64),c=>c.charCodeAt(0));
        const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
        setPdf({url,revision:request.revision,notice:result.notice});
      }catch{if(current())setError({revision:request.revision,message:'The draft response could not be confirmed. Retry the preview; no official document was issued.'});}
      finally{if(alive.current)setBusy(false);}
    })();
    flight.current=job;
    try{await job;}finally{if(flight.current===job){flight.current=null;flightRevision.current=null;}}
  };
  const refreshRef=useRef(refresh);useLayoutEffect(()=>{refreshRef.current=refresh;});
  useEffect(()=>{
    if(!canPreview||locked)return;
    const timer=setTimeout(()=>{if(attemptedRevision.current!==revision)void refreshRef.current();},500);
    return()=>clearTimeout(timer);
  },[revision,canPreview,locked]);

  const currentPdf=pdf?.revision===revision&&canPreview&&!busy&&!error;
  const issue=async()=>{
    if(issuing.current||wordingReview||!currentPdf||!item.generatable||!item.canGenerate||!onIssue||locked)return;
    issuing.current=true;setIssueFlight(true);
    try{await onIssue(language,inputs,templateId??undefined);}
    finally{issuing.current=false;if(alive.current)setIssueFlight(false);}
  };
  if(owner?.isLive()===false)return null;
  const setField=(key:string,value:string)=>setInputs(old=>({...old,[key]:value}));
  const rows=[...templates.rows,...(templates.selected&&!templates.rows.some(row=>row.id===templates.selected!.id)?[templates.selected]:[])];
  const status=issued?'Issued':wordingReview?'Wording review — sample details only':item.generatable?'Draft — not issued':item.wordingApproved?'Wording approved — source integration required':'Draft — wording approval pending';
  return <ERPChildDialogForm open onOpenChange={onOpenChange} title={confirmation?'Employment Confirmation Certificate':item.name} subtitle="Prepare the document and review its draft in one place."
    size="workbench" bodyClassName="p-0 lg:overflow-hidden" mode="add" cancelLabel="Close" isSubmitting={isIssuing||issueFlight} closeDisabled={reviewPending} isDirty={reviewDirty||language!==(item.previewLanguages?.[0]??'en')||templateId!==null||wordingReview!==(initialSample)||JSON.stringify(inputs)!==JSON.stringify(initialInputs(initialSample))}
    onSubmit={refresh} submitLabel="Refresh preview" submitDisabled={!canPreview||busy||locked}
    footerActions={<Button type="button" disabled={wordingReview||!currentPdf||!item.generatable||!item.canGenerate||!onIssue||locked} onClick={()=>void issue()}>Generate Official</Button>}>
    <div className="grid min-h-full min-w-0 grid-cols-1 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)]">
      <section aria-label="Letter settings" className="min-w-0 space-y-5 border-b bg-background p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <p className="text-sm font-semibold">Letter settings</p>
        <fieldset disabled={locked} className="min-w-0 space-y-4">
          {!confirmation&&<div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wordingReview}
            onChange={event=>{setWordingReview(event.target.checked);setInputs(initialInputs(event.target.checked));}}/>Use sample details for wording review</label>
            {wordingReview&&<p className="mt-2 text-xs text-muted-foreground">The PDF uses a clearly labelled sample person and sample details. It does not certify this employee or permit official issuance.</p>}</div>}
          <div><label htmlFor="employment-language" className="mb-1 block text-sm">Language</label>
            <select id="employment-language" value={language} onChange={e=>setLanguage(e.target.value as OfficialDocumentLanguage)} className="w-full rounded-sm border bg-background p-2 text-foreground">
              {(item.previewLanguages??[]).map(value=><option key={value} value={value}>{value==='en'?'English':value==='ar'?'العربية':'English + العربية'}</option>)}
            </select></div>
          <div><p className="mb-1 text-sm">Company letterhead</p>
            {item.canBrandingOverride?<>
              <ERPCombobox ariaLabel="Company letterhead" value={templateId??'default'} required allowClear={false}
                popoverClassName="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-3rem)]"
                options={[{value:'default',label:"Employee's company default"},...rows.map(row=>({value:row.id,label:row.template_name,description:row.company_name??row.branding_profile_name,disabled:!row.selectable}))]}
                onValueChange={value=>{if(value==='default')setTemplateId(null);else if(typeof value==='number'&&rows.some(row=>row.id===value&&row.selectable))setTemplateId(value);}}
                onSearchQueryChange={templates.setSearch} filterFn={()=>true} loading={templates.busy&&rows.length===0} disabled={templates.denied||locked}/>
              {templates.busy&&rows.length>0&&<p role="status" className="mt-1 text-xs text-muted-foreground">Checking letterhead…</p>}
              {(templates.error||templates.denied||templates.selectionUnavailable)&&<div className="mt-1 text-sm text-destructive" role="alert">The selected letterhead could not be verified. Choose company default or retry.
                {!templates.denied&&<Button type="button" variant="outline" onClick={templates.retry}>Retry letterheads</Button>}
              </div>}
              {templates.totalCount!==null&&templates.totalCount>templates.pageSize&&<div className="mt-2 flex items-center gap-2 text-xs">
                <Button type="button" variant="outline" disabled={!templates.ready||templates.page<=1} onClick={()=>templates.move(templates.page-1)}>Previous templates</Button>
                <span>Page {templates.page}</span><Button type="button" variant="outline" disabled={!templates.ready||templates.page*templates.pageSize>=templates.totalCount} onClick={()=>templates.move(templates.page+1)}>Next templates</Button>
              </div>}
            </>:<p className="text-sm text-muted-foreground">Employee&apos;s company default</p>}
          </div>
          {confirmation&&<><div><label htmlFor="employment-recipient" className="mb-1 block text-sm">Addressed to</label>
            <select id="employment-recipient" value={inputs.recipient_mode} onChange={e=>setField('recipient_mode',e.target.value)} className="w-full rounded-sm border bg-background p-2 text-foreground">
              <option value="general">To whom it may concern</option><option value="specific">Specific recipient</option>
            </select></div>
          {inputs.recipient_mode==='specific'&&EMPLOYMENT_RECIPIENT_FIELDS.filter(field=>field.key.startsWith('recipient_')&&field.key!=='recipient_mode'&&(language==='bilingual'||field.key.endsWith(`_${language}`))).map(field=><div key={field.key}>
            <label htmlFor={`employment-${field.key}`} className="mb-1 block text-sm">{field.labelEn}</label>
            <Input id={`employment-${field.key}`} dir={field.key.endsWith('_ar')?'rtl':undefined} maxLength={field.maxLength} value={inputs[field.key]??''} onChange={e=>setField(field.key,e.target.value)}/>
          </div>)}
          {inputError&&<p role="alert" className="text-sm text-destructive">{inputError}</p>}
          <div><label htmlFor="employment-title" className="mb-1 block text-sm">Employee title</label>
            <select id="employment-title" value={inputs.employee_title} onChange={e=>setField('employee_title',e.target.value)} className="w-full rounded-sm border bg-background p-2 text-foreground">
              <option value="">No title</option><option value="Mr.">Mr.</option><option value="Ms.">Ms.</option>
            </select></div></>}
          {!confirmation&&inputError&&<p role="alert" className="text-sm text-destructive">{inputError}</p>}
          {!confirmation&&(item.optionalInputs??[]).map(field=><div key={field.key}>
            <label htmlFor={`draft-input-${field.key}`} className="mb-1 block text-sm">{field.labelEn}{field.required?' *':''}</label>
            {!wordingReview&&field.key==='source_review_id'?<HrLetterReviewPanel employeeId={employeeId} code={item.outputCode as LetterReviewRequest['code']} value={inputs[field.key]??''} disabled={locked} onChange={value=>setField(field.key,value)} onPending={setReviewPending} onDirty={setReviewDirty}/>:!wordingReview&&HR_LETTER_SELECTIONS[item.outputCode]?.key===field.key?<HrLetterSourceSelector employeeId={employeeId} code={item.outputCode} value={inputs[field.key]??''} disabled={locked} onChange={value=>setField(field.key,value)}/>:field.choices?.length?<select id={`draft-input-${field.key}`} value={inputs[field.key]??''} onChange={event=>setField(field.key,event.target.value)} className="w-full rounded-sm border bg-background p-2 text-foreground">
              {!field.required&&<option value="">Not specified</option>}{field.choices.map(choice=><option key={choice.value} value={choice.value}>{choice.labelEn}</option>)}
            </select>:<Input id={`draft-input-${field.key}`} type={field.type??'text'} required={field.required} maxLength={field.maxLength} dir={field.key.endsWith('_ar')?'rtl':undefined}
              value={inputs[field.key]??''} placeholder={field.placeholder} onChange={event=>setField(field.key,event.target.value)}/>}
            {field.helpText&&<p className="mt-1 text-xs text-muted-foreground">{field.helpText}</p>}
          </div>)}
        </fieldset>
        <p className="text-xs text-muted-foreground">Employee and company details come from the permitted record. Changes here apply to this letter only.</p>
        {!item.generatable&&<p className="text-sm text-muted-foreground">{item.wordingApproved?(item.sourceWorkflowReason??'Wording is approved. This document remains held until its verified source workflow is integrated.'):'Review the new wording as a draft. Recorded wording approval is required before official generation.'}</p>}
        {item.approvalRequired&&<p className="text-sm text-muted-foreground">An authorized document approver must issue this letter. No approval request is sent from this screen.</p>}
      </section>
      <section aria-label="Document preview" className="flex min-h-[55dvh] min-w-0 flex-col bg-muted/30 p-4 lg:min-h-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{status}</strong>
          {currentPdf&&!issued&&<a className="text-primary underline" href={pdf!.url} download={`${item.outputCode}-DRAFT.pdf`}>Download draft</a>}
        </div>
        {issueFeedback&&<div role="status" className="mb-3 rounded-sm border bg-background p-3 text-sm"><strong>{issueFeedback.title}</strong><p>{issueFeedback.message}</p></div>}
        <div className="relative min-h-[50dvh] min-w-0 flex-1 border bg-background lg:min-h-0" aria-busy={busy}>
          {pdf&&<iframe title="Canonical draft PDF" src={pdf.url} className="absolute inset-0 h-full w-full" aria-hidden={!currentPdf||issued} inert={!currentPdf||issued||undefined}/>}
          {(!currentPdf||issued)&&<div className="absolute inset-0 flex items-center justify-center bg-background/95 p-6 text-center text-sm" role={error?.revision===revision?'alert':'status'}>
            {issued?'The official original is available in Issued Documents. This draft is not the issued original.':inputError??(error?.revision===revision?error.message:!selectionReady?'Checking the selected letterhead…':busy?'Updating draft preview…':'Preparing the draft preview…')}
          </div>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Draft only. Official generation creates the saved original, reference and policy-governed QR after all approval checks pass.</p>
      </section>
    </div>
  </ERPChildDialogForm>;
}
