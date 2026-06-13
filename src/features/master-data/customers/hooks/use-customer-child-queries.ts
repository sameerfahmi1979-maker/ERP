/**
 * TanStack Query hooks for Customer child tables.
 * Phase 002F.3E.3B.6G.3 — Customer Child Tables TanStack Query Migration
 * Phase 002F.3E.3B.6G.4 — refactored onto the generic useChildTableQuery
 *
 * Public API (names, parameters, return shape, query keys, timing) is
 * unchanged from 3B.6G.3 — these hooks now simply delegate to the generic
 * child-table helper that future modules (Vendors, Subcontractors, …) use.
 *
 * Keys produced are identical to before:
 *   ["child","customer_contacts",customerId]      (= queryKeys.child.customerContacts)
 *   ["child","customer_addresses",customerId]     (= queryKeys.child.customerAddresses)
 *   ["child","customer_bank_details",customerId]  (= queryKeys.child.customerBankDetails)
 */

"use client";

import {
  useChildTableQuery,
  type ChildTableQueryOptions,
  type ChildTableQueryResult,
} from "@/hooks/child-tables/use-child-table-query";
import { getCustomerContacts } from "@/server/actions/master-data/customer-contacts";
import { getCustomerAddresses } from "@/server/actions/master-data/customer-addresses";
import { getCustomerBankDetails } from "@/server/actions/master-data/customer-bank-details";
import type {
  CustomerContact,
  CustomerAddress,
  CustomerBankDetail,
} from "@/features/master-data/customers/types";

// Backward-compatible aliases (3B.6G.3 names)
export type CustomerChildQueryOptions = ChildTableQueryOptions;
export type CustomerChildQueryResult<T> = ChildTableQueryResult<T>;

export function useCustomerContactsQuery(
  customerId: number | null | undefined,
  options: CustomerChildQueryOptions = {}
): CustomerChildQueryResult<CustomerContact> {
  return useChildTableQuery<CustomerContact>({
    tableName: "customer_contacts",
    parentId: customerId,
    fetcher: getCustomerContacts,
    errorLabel: "contacts",
    enabled: options.enabled,
  });
}

export function useCustomerAddressesQuery(
  customerId: number | null | undefined,
  options: CustomerChildQueryOptions = {}
): CustomerChildQueryResult<CustomerAddress> {
  return useChildTableQuery<CustomerAddress>({
    tableName: "customer_addresses",
    parentId: customerId,
    fetcher: getCustomerAddresses,
    errorLabel: "addresses",
    enabled: options.enabled,
  });
}

export function useCustomerBankDetailsQuery(
  customerId: number | null | undefined,
  options: CustomerChildQueryOptions = {}
): CustomerChildQueryResult<CustomerBankDetail> {
  return useChildTableQuery<CustomerBankDetail>({
    tableName: "customer_bank_details",
    parentId: customerId,
    fetcher: getCustomerBankDetails,
    errorLabel: "bank details",
    enabled: options.enabled,
  });
}
