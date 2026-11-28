# Operational intelligence and capacity overview

Milestone 6 adds descriptive, tenant-scoped summaries over the operational records already maintained by WardPilot. It does not generate predictions, diagnoses, staffing recommendations or clinical decisions.

## Endpoint

`GET /api/v1/intelligence/overview`

Requires an authenticated active organization membership.

Optional query parameters:
- `facilityId`: active facility identifier belonging to the caller's organization.
- `from`, `to`: ISO 8601 timestamps with offsets. Defaults to the previous 30 days through the current time. The interval must be positive and cannot exceed 90 days.

## Returned measures

- **Capacity:** registered beds by available, reserved, occupied, cleaning and maintenance status; total beds; occupancy and available rates.
- **Patient flow:** active admissions, admissions and discharges in the reporting window, and average length of stay for discharges in that window.
- **Workforce:** shifts by lifecycle status and unique staff with overlapping shifts in the reporting window.
- **Inventory:** active items, items at/below reorder point and items with zero stock.
- **Operational signals:** deterministic threshold alerts for high occupancy (90%+), out-of-stock items, low stock, beds in maintenance and empty capacity scopes.

All database queries include the authenticated organization scope; facility filters are validated against that same tenant. The response contains aggregate counts only and explicitly reports that patient-identifiable information is not included.

## Metric definitions and limitations

- Occupancy rate = occupied registered beds / all registered beds × 100. It is a point-in-time snapshot, not a historical occupancy curve.
- Admissions/discharges use the selected reporting window; active admissions are a current snapshot.
- Average length of stay is the arithmetic mean of elapsed hours for admissions discharged during the selected window. It is not adjusted for case mix.
- Workforce counts represent shift records, not actual attendance or credentialed staffing adequacy.
- Inventory thresholds use the configured reorder point and integer on-hand quantity; no valuation, expiry or lot-level analysis is implied.
- Threshold alerts are descriptive signals, not forecasts or automated operational actions.

## Security and validation

- Authentication middleware is applied to the intelligence router.
- Organization IDs are derived only from verified request context.
- A requested facility must be active and belong to the authenticated organization.
- Reporting windows are validated and limited to 90 days.
- No patient names, medical record numbers, phone numbers or clinical details are returned.

The endpoint is an operational analytics prototype. Before real deployment, validate definitions with hospital operations stakeholders, assess data quality and timezone semantics, add observability/performance budgets, and complete privacy/security review.
