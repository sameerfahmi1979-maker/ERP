'use client';
import {HrRecordEditor,type HrRecordEditorProps} from './hr-record-editor';
export function ProProcessEditor(props:Omit<HrRecordEditorProps,'kind'>){return <HrRecordEditor {...props} kind="pro-process"/>;}
