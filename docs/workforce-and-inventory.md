# Workforce scheduling and critical inventory

This milestone adds two operational domains under `/api/v1/operations`. All records are scoped to the authenticated organization; the API does not accept organization identifiers from clients.

## Workforce scheduling

- Managers, owners and admins can schedule day, evening, night and on-call shifts at an active facility.
- Assigned staff must be an active non-viewer organization member.
- Optional departments must be active and belong to the selected facility.
- Shifts are limited to 16 hours and must have a valid positive time window.
- Overlapping scheduled/confirmed shifts for the same staff member are rejected.
- A tenant/member schedule-lock record is updated inside a MongoDB transaction before overlap checking to serialize concurrent schedule writes.
- State transitions are controlled: scheduled → confirmed/cancelled; confirmed → completed/cancelled.
- Shift changes append actor-attributed events to the shift event history.

## Critical inventory

- Inventory items are facility-scoped with item code, category, unit, on-hand balance, reorder point and par level.
- Initial stock starts at zero. Every quantity change must be recorded through the movement ledger.
- Receive movements must be positive; consume movements must be negative; adjustments can be positive or negative.
- A movement cannot reduce stock below zero. Stock updates and movement-ledger inserts are performed in one MongoDB transaction with a conditional balance update.
- Each movement requires a tenant-scoped idempotency key. Reusing a key with a different payload returns a conflict.
- Low-stock views identify items at or below their reorder point.
- Movement records preserve quantity change, resulting balance, reason/reference, actor and timestamp.

## Endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/operations/shifts` | Authenticated | List shifts with facility, date-window and status filters |
| POST | `/operations/shifts` | Owner/admin/manager | Schedule a staff shift |
| PATCH | `/operations/shifts/:shiftId/status` | Owner/admin/manager | Confirm, complete or cancel a shift |
| GET | `/operations/inventory` | Authenticated | List facility inventory; `lowStock=true` filters reorder items |
| POST | `/operations/inventory` | Owner/admin/manager | Register an item at zero opening balance |
| POST | `/operations/inventory/:itemId/movements` | Owner/admin/manager/staff | Record receipt, consumption or adjustment |
| GET | `/operations/inventory/:itemId/movements` | Authenticated | Read the movement history |

## Data and safety boundaries

- The module manages workforce coverage and non-clinical supply inventory only. It is not a staff credentialing system, clinical staffing ratio engine, medication administration record, pharmacy dispensing system or patient-care recommendation engine.
- Inventory quantities are tracked as integer units. Batch/lot numbers, expiry, controlled substances, serial tracking, purchase requisitions and supplier integrations are not yet implemented.
- The transaction-backed workflows require MongoDB running as a replica set. Docker/local development must use a replica-set configuration.
- Unit tests cover overlap, shift-duration and stock-balance rules. Database-backed integration tests should additionally cover concurrent scheduling, duplicate idempotency keys and cross-tenant denial before production.
- Scheduling and stock movements are operational records, not proof of regulatory staffing compliance or clinical supply suitability.
