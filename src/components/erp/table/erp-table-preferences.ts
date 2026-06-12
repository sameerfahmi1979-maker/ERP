/**
 * ERP Table Preferences - localStorage Utilities
 * Phase 002E.2A - Global Table Rules
 */

import type { ERPTablePreferences } from "./erp-table-types";

const STORAGE_PREFIX = "erp_table_prefs";
const STORAGE_VERSION = "v1";

/**
 * Generate storage key for table preferences
 */
function getStorageKey(userProfileId: number | string, tableId: string): string {
  return `${STORAGE_PREFIX}:${STORAGE_VERSION}:${userProfileId}:${tableId}`;
}

/**
 * Load table preferences from localStorage
 */
export function loadTablePreferences(
  userProfileId: number | string,
  tableId: string
): ERPTablePreferences | null {
  try {
    const key = getStorageKey(userProfileId, tableId);
    const stored = localStorage.getItem(key);
    
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as ERPTablePreferences;
    
    // Validate structure
    if (typeof parsed !== "object" || parsed === null) {
      console.warn(`Invalid preferences for table ${tableId}`);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`Failed to load preferences for table ${tableId}:`, error);
    return null;
  }
}

/**
 * Save table preferences to localStorage
 */
export function saveTablePreferences(
  userProfileId: number | string,
  tableId: string,
  preferences: ERPTablePreferences
): boolean {
  try {
    const key = getStorageKey(userProfileId, tableId);
    const data: ERPTablePreferences = {
      ...preferences,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`Failed to save preferences for table ${tableId}:`, error);
    return false;
  }
}

/**
 * Clear table preferences from localStorage
 */
export function clearTablePreferences(
  userProfileId: number | string,
  tableId: string
): boolean {
  try {
    const key = getStorageKey(userProfileId, tableId);
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to clear preferences for table ${tableId}:`, error);
    return false;
  }
}

/**
 * Get all table preference keys for a user
 */
export function getUserTableKeys(userProfileId: number | string): string[] {
  try {
    const prefix = `${STORAGE_PREFIX}:${STORAGE_VERSION}:${userProfileId}:`;
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  } catch (error) {
    console.error("Failed to get user table keys:", error);
    return [];
  }
}

/**
 * Clear all table preferences for a user
 */
export function clearAllUserPreferences(userProfileId: number | string): boolean {
  try {
    const keys = getUserTableKeys(userProfileId);
    keys.forEach((key) => localStorage.removeItem(key));
    return true;
  } catch (error) {
    console.error("Failed to clear all user preferences:", error);
    return false;
  }
}

/**
 * Get storage size estimate in bytes
 */
export function getPreferencesSize(userProfileId: number | string): number {
  try {
    const keys = getUserTableKeys(userProfileId);
    let totalSize = 0;

    keys.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += key.length + value.length;
      }
    });

    return totalSize;
  } catch (error) {
    console.error("Failed to calculate preferences size:", error);
    return 0;
  }
}
