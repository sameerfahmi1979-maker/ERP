/**
 * ERP COMMON AI.6 — AI Search Library Public API
 */

export type {
  ErpSearchMode,
  ErpSearchEntityType,
  ErpSearchResultType,
  ErpSearchIntent,
  ErpSearchFilters,
  ErpSearchResult,
  ErpSearchResponse,
  ErpSearchBadgeData,
  ErpSearchResultGroup,
  ErpRecentSearch,
  SearchAcrossErpInput,
  SaveRecentSearchInput,
} from "./types";

export { runErpSearch } from "./search-engine";
export { extractErpSearchIntent } from "./intent-extractor";
export { decorateResultsWithSignals } from "./signal-decorators";
export { mergeAndRankResults, groupResults } from "./result-merger";
export {
  loadRecentSearches,
  saveRecentSearch,
  clearRecentSearches,
  trimRecentSearches,
} from "./recent-searches";
