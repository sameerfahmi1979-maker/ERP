"use client";
import type {PayrollInquiryProps} from "@/hooks/use-hr-payroll-inquiries";
import {PayrollInquiryPageClient} from "../hr-payroll-inquiry-page-client";
export function HrSalariesPageClient(props: PayrollInquiryProps) {return <PayrollInquiryPageClient {...props} kind="salary" />;}
