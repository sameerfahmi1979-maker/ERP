// Prevent this isolated no-backend fixture from discovering the ERP ancestor proxy.
import { NextResponse } from 'next/server';
export function proxy() { return NextResponse.next(); }
