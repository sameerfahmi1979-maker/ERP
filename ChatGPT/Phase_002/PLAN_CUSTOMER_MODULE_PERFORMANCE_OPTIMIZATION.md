# PLAN: Customer Module Performance Optimization

**Phase**: ERP BASE 002F.3E.3B — Customer Module Performance Optimization  
**Date**: June 8, 2026  
**Purpose**: Eliminate loading delays when switching tabs in customer drawer

---

## 1. Current Performance Issues

### Observed Problems
- **Basic Info tab**: ~1000ms load time
- **Contacts tab**: ~779ms load time  
- **Addresses tab**: ~800ms load time (estimated)
- **Bank Details tab**: ~897ms load time
- **UAE Compliance section**: ~947ms load time for lookups

### Root Causes Identified

1. **Sequential Loading** ❌
   - Each tab loads data independently when clicked
   - User experiences delay every time they switch tabs
   - Network round-trips add up (150ms proxy overhead per request)

2. **Lack of Database Indexes** ⚠️
   - Child tables (`customer_contacts`, `customer_addresses`, `customer_bank_details`) may not have indexes on `customer_id`
   - Full table scans slow down queries

3. **No Data Caching** ❌
   - Same data fetched multiple times if user switches between tabs
   - No optimization for repeated access

---

## 2. Proposed Solution Architecture

### Two-Pronged Approach

#### **Part A: Frontend Optimization** (Immediate Impact)
Pre-load all customer data when drawer opens, cache in React state.

#### **Part B: Database Optimization** (Long-term Performance)
Add indexes to child tables for faster filtering.

---

## 3. Part A: Frontend Parallel Loading

### 3.1 Files to Modify

```
src/features/master-data/customers/components/customer-form-drawer.tsx
```

### 3.2 Current Flow (Sequential)

```typescript
// User opens drawer
→ Load basic customer info (1s)

// User clicks Contacts tab
→ Contacts component loads data (0.8s delay)

// User clicks Addresses tab  
→ Addresses component loads data (0.8s delay)

// User clicks Bank Details tab
→ Bank details component loads data (0.9s delay)

Total: 3.5s+ of delays
```

### 3.3 Proposed Flow (Parallel Pre-load)

```typescript
// User opens drawer
→ Load ALL data in parallel:
  - Customer basic info
  - Customer contacts
  - Customer addresses  
  - Customer bank details
  (Total: 1s for all together)

// User clicks Contacts tab
→ Data already loaded (0ms delay) ⚡

// User clicks Addresses tab
→ Data already loaded (0ms delay) ⚡

// User clicks Bank Details tab
→ Data already loaded (0ms delay) ⚡

Total: 1s initial load, then instant tab switching
```

### 3.4 Implementation Strategy

1. **Create composite loader function** in drawer component
2. **Use Promise.all** to fetch all data in parallel
3. **Store in parent state** and pass to child components as props
4. **Child components receive data as props** instead of fetching independently
5. **Refresh mechanism** after create/update/delete operations

### 3.5 Code Changes Required

#### customer-form-drawer.tsx
```typescript
// Add state for child data
const [contacts, setContacts] = useState<CustomerContact[]>([]);
const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
const [bankDetails, setBankDetails] = useState<CustomerBankDetail[]>([]);
const [loading, setLoading] = useState(true);

// Load all data in parallel
const loadAllCustomerData = async (customerId: number) => {
  setLoading(true);
  try {
    const [customerResult, contactsResult, addressesResult, bankDetailsResult] = 
      await Promise.all([
        getCustomer(customerId),
        getCustomerContacts(customerId),
        getCustomerAddresses(customerId),
        getCustomerBankDetails(customerId)
      ]);
    
    if (customerResult.success) setCustomerData(customerResult.data);
    if (contactsResult.success) setContacts(contactsResult.data);
    if (addressesResult.success) setAddresses(addressesResult.data);
    if (bankDetailsResult.success) setBankDetails(bankDetailsResult.data);
  } catch (error) {
    toast.error("Failed to load customer data");
  } finally {
    setLoading(false);
  }
};

// Call on mount and after updates
useEffect(() => {
  if (customerId && mode !== 'add') {
    loadAllCustomerData(customerId);
  }
}, [customerId, mode]);
```

#### child section components
```typescript
// Update CustomerContactsSection to accept data as prop
export function CustomerContactsSection({ 
  customerId, 
  contacts, 
  onRefresh, 
  disabled 
}: {
  customerId: number;
  contacts: CustomerContact[];
  onRefresh: () => void;
  disabled?: boolean;
}) {
  // Remove internal useEffect and loading state
  // Use passed contacts prop directly
  // Call onRefresh after create/update/delete
}
```

### 3.6 Benefits

- ✅ **75% reduction** in total wait time (4s → 1s)
- ✅ **Instant tab switching** after initial load
- ✅ **Better UX** - no stuttering between tabs
- ✅ **Reduced network requests** - one batch instead of multiple
- ✅ **Simpler error handling** - catch all failures in one place

### 3.7 Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Larger initial load | Acceptable - 1s load once is better than 0.8s × 4 tabs |
| More complex state management | Isolated to drawer component only |
| Refresh logic needs updating | Implement `onRefresh` callback pattern |
| Add mode doesn't need child data | Skip child data loading when `mode === 'add'` |

---

## 4. Part B: Database Index Optimization

### 4.1 Indexes to Add

```sql
-- Customer Contacts - filter by customer_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_contacts_customer_id 
  ON customer_contacts(customer_id)
  WHERE is_active = true;

-- Customer Addresses - filter by customer_id  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_addresses_customer_id 
  ON customer_addresses(customer_id)
  WHERE is_active = true;

-- Customer Bank Details - filter by customer_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_bank_details_customer_id 
  ON customer_bank_details(customer_id)
  WHERE is_active = true;

-- Composite index for primary flag queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_contacts_customer_id_primary
  ON customer_contacts(customer_id, is_primary)
  WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_addresses_customer_id_primary
  ON customer_addresses(customer_id, is_primary)
  WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_bank_details_customer_id_primary
  ON customer_bank_details(customer_id, is_primary)
  WHERE is_active = true;
```

### 4.2 Why CONCURRENTLY?

- ✅ Doesn't lock table during index creation
- ✅ Safe for production use
- ✅ Allows normal operations to continue
- ⚠️ Takes longer to create, but worth it

### 4.3 Expected Performance Impact

| Query | Before Index | After Index | Improvement |
|-------|--------------|-------------|-------------|
| Get contacts by customer_id | 779ms | ~100-200ms | 4-8x faster |
| Get addresses by customer_id | 800ms | ~100-200ms | 4-8x faster |
| Get bank details by customer_id | 897ms | ~100-200ms | 4-8x faster |

### 4.4 Verification Query

```sql
-- Check if indexes exist
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('customer_contacts', 'customer_addresses', 'customer_bank_details')
  AND indexname LIKE '%customer_id%';
```

---

## 5. Implementation Plan

### Phase 1: Database Indexes (Low Risk, Immediate Benefit)

**Steps**:
1. ✅ Verify current indexes
2. ✅ Create migration file with CONCURRENTLY indexes
3. ✅ Apply migration to development database
4. ✅ Test query performance
5. ✅ Apply to production (no downtime)

**Time Estimate**: 30 minutes  
**Risk Level**: LOW  
**Rollback**: Drop indexes if needed (instant)

---

### Phase 2: Frontend Parallel Loading (Higher Impact)

**Steps**:
1. ✅ Update `customer-form-drawer.tsx` with parallel loading
2. ✅ Refactor `customer-contacts-section.tsx` to accept props
3. ✅ Refactor `customer-addresses-section.tsx` to accept props
4. ✅ Refactor `customer-bank-details-section.tsx` to accept props
5. ✅ Implement refresh callbacks
6. ✅ Test add mode (skip child loading)
7. ✅ Test edit mode (pre-load all data)
8. ✅ Test view mode (pre-load all data)
9. ✅ Test create/update/delete refresh flow
10. ✅ Run typecheck and build

**Time Estimate**: 2 hours  
**Risk Level**: MEDIUM  
**Rollback**: Git revert if issues found

---

## 6. Testing Plan

### 6.1 Performance Testing

**Before Optimization**:
- [ ] Measure: Open customer drawer → time to basic info display
- [ ] Measure: Click Contacts tab → time to contacts display
- [ ] Measure: Click Addresses tab → time to addresses display
- [ ] Measure: Click Bank Details tab → time to bank details display
- [ ] Total time: _____ ms

**After Optimization**:
- [ ] Measure: Open customer drawer → time to all data loaded
- [ ] Measure: Click Contacts tab → instant?
- [ ] Measure: Click Addresses tab → instant?
- [ ] Measure: Click Bank Details tab → instant?
- [ ] Total time: _____ ms
- [ ] Improvement: _____ %

### 6.2 Functional Testing

- [ ] **Add Customer**: Does NOT load child data (mode='add')
- [ ] **Edit Customer**: Pre-loads all child data
- [ ] **View Customer**: Pre-loads all child data (read-only)
- [ ] **Add Contact**: Refreshes contacts list after save
- [ ] **Edit Contact**: Refreshes contacts list after update
- [ ] **Delete Contact**: Refreshes contacts list after delete
- [ ] **Add Address**: Refreshes addresses list after save
- [ ] **Edit Address**: Refreshes addresses list after update
- [ ] **Delete Address**: Refreshes addresses list after delete
- [ ] **Add Bank Detail**: Refreshes bank details list after save
- [ ] **Edit Bank Detail**: Refreshes bank details list after update
- [ ] **Delete Bank Detail**: Refreshes bank details list after delete
- [ ] **Tab switching**: Instant after initial load
- [ ] **Loading state**: Shows spinner during initial load only

### 6.3 Error Handling

- [ ] Network error during load: Shows error toast
- [ ] Partial data load failure: Handles gracefully
- [ ] Child data refresh fails: Shows error, keeps old data

---

## 7. Performance Targets

### Current Performance (Baseline)
```
Open drawer:        1000ms
Click Contacts:     + 779ms
Click Addresses:    + 800ms
Click Bank Details: + 897ms
────────────────────────────
Total UX time:      3476ms
```

### Target Performance (After Optimization)

#### Minimum Target (Indexes Only)
```
Open drawer:        500ms
Click Contacts:     + 500ms
Click Addresses:    + 500ms
Click Bank Details: + 500ms
────────────────────────────
Total UX time:      2000ms (42% improvement)
```

#### Optimal Target (Indexes + Parallel Loading)
```
Open drawer:        500-800ms (all data loaded)
Click Contacts:     0ms (instant)
Click Addresses:    0ms (instant)
Click Bank Details: 0ms (instant)
────────────────────────────
Total UX time:      500-800ms (77-86% improvement)
```

---

## 8. Migration File Structure

### File: `20260608133000_customer_module_performance_indexes.sql`

```sql
-- Migration: Customer Module Performance Indexes
-- Phase: ERP BASE 002F.3E.3B
-- Date: 2026-06-08
-- Description: Add indexes to customer child tables for faster filtering

-- Customer Contacts Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_contacts_customer_id 
  ON customer_contacts(customer_id)
  WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_contacts_customer_id_primary
  ON customer_contacts(customer_id, is_primary)
  WHERE is_active = true;

-- Customer Addresses Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_addresses_customer_id 
  ON customer_addresses(customer_id)
  WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_addresses_customer_id_flags
  ON customer_addresses(customer_id, is_primary, is_billing_address, is_shipping_address)
  WHERE is_active = true;

-- Customer Bank Details Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_bank_details_customer_id 
  ON customer_bank_details(customer_id)
  WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_bank_details_customer_id_primary
  ON customer_bank_details(customer_id, is_primary)
  WHERE is_active = true;
```

---

## 9. Rollback Plan

### If Performance Degrades

**Indexes**:
```sql
-- Drop indexes (instant, no downtime)
DROP INDEX CONCURRENTLY IF EXISTS idx_customer_contacts_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_customer_contacts_customer_id_primary;
DROP INDEX CONCURRENTLY IF EXISTS idx_customer_addresses_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_customer_addresses_customer_id_flags;
DROP INDEX CONCURRENTLY IF EXISTS idx_customer_bank_details_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_customer_bank_details_customer_id_primary;
```

**Frontend Changes**:
```bash
# Revert to previous commit
git revert HEAD
npm run build
```

---

## 10. Success Criteria

### Must Have ✅
- [ ] Tab switching takes < 100ms after initial load
- [ ] Initial drawer load completes in < 1 second
- [ ] All child data displays correctly
- [ ] Create/update/delete still works
- [ ] No regressions in existing functionality

### Nice to Have 🎯
- [ ] Database query time < 200ms per child table
- [ ] Total UX time reduced by > 70%
- [ ] Loading states provide clear feedback
- [ ] Error handling is robust

---

## 11. Deployment Strategy

### Development
1. Apply indexes to dev database
2. Test query performance
3. Implement frontend changes
4. Test in local environment
5. Verify all functionality works

### Staging (if available)
1. Deploy indexes
2. Deploy frontend changes
3. Perform full regression testing
4. Load test with multiple concurrent users

### Production
1. Apply indexes during low-traffic period (CONCURRENTLY = no downtime)
2. Monitor database performance
3. Deploy frontend changes
4. Monitor application performance
5. Collect user feedback

---

## 12. Monitoring & Validation

### Database Monitoring
```sql
-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexname LIKE '%customer_contacts%'
   OR indexname LIKE '%customer_addresses%'
   OR indexname LIKE '%customer_bank_details%'
ORDER BY idx_scan DESC;

-- Query performance
EXPLAIN ANALYZE
SELECT * FROM customer_contacts 
WHERE customer_id = 1 AND is_active = true;
```

### Application Monitoring
- Track drawer open time (metrics/analytics)
- Track tab switch time
- Monitor error rates
- Collect user satisfaction feedback

---

## 13. Follow-up Optimizations (Future)

### Phase 2 Enhancements
- [ ] Implement optimistic UI updates
- [ ] Add client-side caching (React Query / SWR)
- [ ] Lazy load non-critical data (documents tab)
- [ ] Prefetch next/previous customer data
- [ ] Add pagination for large contact/address lists

### Backend Optimizations
- [ ] Implement server-side caching (Redis)
- [ ] Create composite API endpoint for full customer data
- [ ] Use database materialized views for complex queries
- [ ] Add read replicas for read-heavy operations

---

## 14. Questions & Decisions Needed

### Open Questions
1. ❓ Should we implement this for other party modules (Vendors, Subcontractors)?
2. ❓ What is the acceptable maximum load time?
3. ❓ Should we paginate child records if count exceeds threshold (e.g., > 50)?
4. ❓ Do we need real-time updates for child data or is manual refresh acceptable?

### Decision Points
- [ ] **Immediate**: Start with Part A (frontend) or Part B (indexes) first?
- [ ] **Immediate**: Apply to development first or directly to production?
- [ ] **Soon**: Implement same pattern for other party modules?
- [ ] **Future**: Consider more aggressive caching strategies?

---

## 15. Approval Checklist

**Before Implementation**:
- [ ] Plan reviewed and approved
- [ ] Approach confirmed (frontend + indexes)
- [ ] Timeline acceptable
- [ ] Resource allocation confirmed
- [ ] Risk assessment accepted

**Ready to Proceed**: ⬜ YES  ⬜ NO  ⬜ NEEDS MODIFICATION

---

## 16. Implementation Estimate

| Task | Time | Assignee | Status |
|------|------|----------|--------|
| Create index migration | 15 min | Agent | Pending |
| Apply indexes to dev DB | 10 min | Agent | Pending |
| Test index performance | 15 min | Agent | Pending |
| Refactor drawer component | 45 min | Agent | Pending |
| Refactor child components | 60 min | Agent | Pending |
| Testing & verification | 30 min | Agent/User | Pending |
| Documentation | 15 min | Agent | Pending |
| **Total** | **3 hours** | | |

---

## 17. Final Recommendation

### Recommended Approach

**Phase 1** (30 minutes):
1. Add database indexes
2. Test performance improvement
3. If sufficient (> 50% improvement), stop here

**Phase 2** (if needed - 2 hours):
1. Implement frontend parallel loading
2. Achieve 75%+ improvement
3. Deploy to production

### Why This Order?

- ✅ Indexes are low-risk, high-reward
- ✅ Can be applied without code changes
- ✅ Reversible instantly if needed
- ✅ May solve problem without frontend changes
- ✅ Frontend changes can build on top of indexed performance

---

**END OF PLAN**

---

## Approval

**Reviewed By**: _________________  
**Date**: _________________  
**Decision**: ⬜ Approved  ⬜ Rejected  ⬜ Needs Revision  
**Comments**: _________________________________________________
