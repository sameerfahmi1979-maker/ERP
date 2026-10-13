"use client";
import {DmsSectionActivity} from "./section-activity";
import {createContext,useContext,type ComponentProps} from "react";
import {ERPChildDialogForm as SharedDialog} from "@/components/erp/erp-child-dialog-form";
import {AlertDialog as SharedAlertDialog} from "@/components/ui/alert-dialog";
export const DmsReadReady=createContext(true);
export const useDmsReadReady=()=>{const ready=useContext(DmsReadReady);const active=useContext(DmsSectionActivity);return ready&&active;};
export function ERPChildDialogForm(props:ComponentProps<typeof SharedDialog>){const ready=useDmsReadReady();return <SharedDialog {...props} open={ready&&props.open} onSubmit={ready?props.onSubmit:undefined}/>;}
export function AlertDialog(props:ComponentProps<typeof SharedAlertDialog>){const ready=useDmsReadReady();return <SharedAlertDialog {...props} open={ready&&props.open}/>;}
import {QueryReadBoundary as SharedBoundary,readHasFailed} from "@/components/erp/query-read-boundary";
/** Retain mounted drafts but hide stale protected content after a failed recheck. */
export function QueryReadBoundary({queries,children}:ComponentProps<typeof SharedBoundary>){
 const ready=useDmsReadReady()&&!queries.some(readHasFailed);
 return <SharedBoundary queries={queries}><DmsReadReady value={ready}><div hidden={!ready}>{children}</div></DmsReadReady></SharedBoundary>;
}
