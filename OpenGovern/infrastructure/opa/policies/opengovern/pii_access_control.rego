package opengovern.policies.pii_access_control

# Policy: PII Data Access Control
# Type: access
# Enforcement: block
#
# Assets classified as PII require an approved, non-expired access request.
# Data stewards and admins bypass this requirement.
#
# Input shape:
#   input.user.id              string
#   input.user.roles           array[string]
#   input.user.approved_requests array[{asset_urn: string, expires_at_ms: int}]
#   input.resource.urn         string
#   input.resource.classifications array[string]
#   input.action               string

default allow = false

# Admins and data stewards have unrestricted access
allow {
    input.user.roles[_] == "admin"
}

allow {
    input.user.roles[_] == "data_steward"
}

# Users with a valid, non-expired approved access request can access
allow {
    has_valid_access_request
}

# Non-PII assets are allowed by default (this policy only concerns PII)
allow {
    not has_pii_classification
}

# Deny rule: PII + no privilege + no valid request
deny[reason] {
    has_pii_classification
    not user_is_admin
    not user_is_steward
    not has_valid_access_request
    reason := {
        "code": "PII_ACCESS_DENIED",
        "message": sprintf("'%v' is classified as PII. An approved access request is required to access this asset.", [input.resource.urn]),
        "workflow_type": "access_request",
        "policy": "pii_access_control"
    }
}

user_is_admin    { input.user.roles[_] == "admin" }
user_is_steward  { input.user.roles[_] == "data_steward" }

# ── Helpers ────────────────────────────────────────────────────────────────────

has_pii_classification {
    input.resource.classifications[_] == "PII"
}

has_valid_access_request {
    request := input.user.approved_requests[_]
    request.asset_urn == input.resource.urn
    # expires_at_ms is Unix timestamp in milliseconds
    request.expires_at_ms > time.now_ns() / 1000000
}
