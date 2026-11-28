# Audit trail and governance

WardPilot records operational audit events for resource, patient-flow, workforce and inventory changes.

## API
`GET /api/v1/audit/events` is restricted to owner, admin and manager memberships. It supports page (default 1), limit (default 25, maximum 100), action, entityType, facilityId, from and to filters. Results are newest first and include actor, action, entity, summary and timestamp. Tenant scope is always derived from the authenticated membership; no organization selector is accepted.

## Event coverage
Facility, department, building, ward and bed creation; bed status changes; patient admission, transfer and discharge; staff shift creation and status transitions; inventory item creation and stock movements.

Patient names, medical record numbers, phone numbers, admission reasons, diagnoses and free-text clinical notes are excluded. Only explicitly allow-listed operational metadata is retained. Patient-flow, shift and stock movement audit writes share the MongoDB transaction of the underlying workflow. Resource creation/status and inventory-item creation events are recorded after the corresponding mutation.

Audit events reject application-level update and delete operations. This is an application-level append-only trail, not a cryptographic tamper-proof ledger: privileged database administrators can still alter records. External log retention, backups, independent security review and regulatory assessment remain necessary before real deployment.
