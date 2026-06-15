"use client";

import {
  useChildTableQuery,
  type ChildTableQueryResult,
} from "@/hooks/child-tables/use-child-table-query";
import { getPartyContacts } from "@/server/actions/master-data/party-contacts";
import { getPartyAddresses } from "@/server/actions/master-data/party-addresses";
import { getPartyBankDetails } from "@/server/actions/master-data/party-bank-details";
import { getPartyLicenses } from "@/server/actions/master-data/party-licenses";
import { getPartyTaxRegistrations } from "@/server/actions/master-data/party-tax-registrations";
import { getPartyDocuments } from "@/server/actions/master-data/party-documents";
import type {
  PartyContact,
  PartyAddress,
  PartyBankDetail,
  PartyLicense,
  PartyTaxRegistration,
  PartyDocument,
} from "@/features/master-data/parties/party-types";

export function usePartyContactsQuery(
  partyId: number | null | undefined
): ChildTableQueryResult<PartyContact> {
  return useChildTableQuery<PartyContact>({
    tableName: "party_contacts",
    parentId: partyId,
    fetcher: getPartyContacts,
    errorLabel: "contacts",
  });
}

export function usePartyAddressesQuery(
  partyId: number | null | undefined
): ChildTableQueryResult<PartyAddress> {
  return useChildTableQuery<PartyAddress>({
    tableName: "party_addresses",
    parentId: partyId,
    fetcher: getPartyAddresses,
    errorLabel: "addresses",
  });
}

export function usePartyBankDetailsQuery(
  partyId: number | null | undefined
): ChildTableQueryResult<PartyBankDetail> {
  return useChildTableQuery<PartyBankDetail>({
    tableName: "party_bank_details",
    parentId: partyId,
    fetcher: getPartyBankDetails,
    errorLabel: "bank details",
  });
}

export function usePartyLicensesQuery(
  partyId: number | null | undefined
): ChildTableQueryResult<PartyLicense> {
  return useChildTableQuery<PartyLicense>({
    tableName: "party_licenses",
    parentId: partyId,
    fetcher: getPartyLicenses,
    errorLabel: "licenses",
  });
}

export function usePartyTaxRegistrationsQuery(
  partyId: number | null | undefined
): ChildTableQueryResult<PartyTaxRegistration> {
  return useChildTableQuery<PartyTaxRegistration>({
    tableName: "party_tax_registrations",
    parentId: partyId,
    fetcher: getPartyTaxRegistrations,
    errorLabel: "tax registrations",
  });
}

export function usePartyDocumentsQuery(
  partyId: number | null | undefined
): ChildTableQueryResult<PartyDocument> {
  return useChildTableQuery<PartyDocument>({
    tableName: "party_documents",
    parentId: partyId,
    fetcher: getPartyDocuments,
    errorLabel: "documents",
  });
}
