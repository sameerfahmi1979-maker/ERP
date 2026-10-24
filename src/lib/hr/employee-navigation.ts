/** Existing dossier sections only. A location hint is never an access grant. */
const sections=['overview','profile','compliance','time','payroll','operations','hr-actions','documents','letters','ai-review','audit']as const;
export function employeeRecordSection(value:unknown):string|undefined {
  return typeof value==='string'&&sections.some(s=>s===value)?value:undefined;
}
export function canApplyEmployeeSectionHint(hint:string|undefined,handled:string|undefined,pending:boolean,active:boolean) {
  return !!employeeRecordSection(hint)&&hint!==handled&&!pending&&active;
}
