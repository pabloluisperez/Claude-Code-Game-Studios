---
Story: STAFF-SYSTEM-003
Status: Complete
Type: Integration
Governing ADR: ADR-009
Control Manifest: 2026-05-19
Test Evidence: tests/integration/staff-system/hiring.test.ts
---

# Story 003: Staff Hiring + Tier System

> **Epic**: staff-system | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `hireStaff(tx, args)`: insert staff row; debit balance via economy
- Tier-1: 1 €K/w; tier-2: 3 €K/w; tier-3: 8 €K/w
- One staff member per role per club; upgrading replaces existing

## ACs
- [ ] Hiring tier-3 deletes tier-1/tier-2 of same role
- [ ] Weekly payroll integration with economy module
