package opengovern.policies.data_retention

# Policy: Data Retention
# Type: retention
# Enforcement: warn (no retention policy set, or past retention date)
#
# Assets with PII or PHI classifications must have a retention policy.
# Assets past their retention date should be flagged for review.
#
# Input context.retention_days: number of days the data should be retained
# Input context.data_age_days: how many days old the oldest data is

default allow = true

# Warn when PII/PHI asset has no retention policy configured
warn[reason] {
    pii_or_phi_asset
    not has_retention_policy
    reason := {
        "code": "NO_RETENTION_POLICY",
        "message": sprintf("'%v' contains PII/PHI data but has no retention policy configured. GDPR/HIPAA may require a defined retention period.", [input.resource.urn]),
        "policy": "data_retention"
    }
}

# Warn when asset has exceeded its retention period
warn[reason] {
    has_retention_policy
    past_retention_date
    reason := {
        "code": "RETENTION_PERIOD_EXCEEDED",
        "message": sprintf("'%v' has data older than its configured retention period. Review and archive or delete old data.", [input.resource.urn]),
        "policy": "data_retention"
    }
}

# ── Helpers ────────────────────────────────────────────────────────────────────

pii_or_phi_asset {
    input.resource.classifications[_] == "PII"
}

pii_or_phi_asset {
    input.resource.classifications[_] == "PHI"
}

has_retention_policy {
    input.context.retention_days != null
    input.context.retention_days > 0
}

past_retention_date {
    input.context.retention_days != null
    input.context.data_age_days != null
    input.context.data_age_days > input.context.retention_days
}
