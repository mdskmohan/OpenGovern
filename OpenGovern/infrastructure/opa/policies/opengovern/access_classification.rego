package opengovern.policies.access_classification

# Policy: Access Control by Data Classification
# Type: access
# Enforcement: block (restricted), warn (confidential)
#
# Sensitivity levels:
#   restricted   → only admin and data_steward can access (hard block)
#   confidential → data_owner, data_steward, admin can access (warn otherwise)
#   internal     → all authenticated users (no restriction)
#   public       → no restriction

default allow = false

allow {
    input.resource.sensitivity == "public"
}

allow {
    input.resource.sensitivity == "internal"
}

allow {
    input.resource.sensitivity == "confidential"
    has_elevated_role
}

allow {
    input.resource.sensitivity == "restricted"
    is_admin_or_steward
}

# Block access to restricted data for non-privileged users
deny[reason] {
    input.resource.sensitivity == "restricted"
    not is_admin_or_steward
    reason := {
        "code": "RESTRICTED_ACCESS_DENIED",
        "message": sprintf("'%v' is classified as RESTRICTED. Only admins and data stewards can access this asset.", [input.resource.urn]),
        "policy": "access_classification"
    }
}

# Warn (but don't block) confidential access without proper role
warn[reason] {
    input.resource.sensitivity == "confidential"
    not has_elevated_role
    reason := {
        "code": "CONFIDENTIAL_ACCESS_WARNING",
        "message": sprintf("'%v' is classified as CONFIDENTIAL. Access has been logged for audit.", [input.resource.urn]),
        "policy": "access_classification"
    }
}

# ── Helpers ────────────────────────────────────────────────────────────────────

is_admin_or_steward {
    input.user.roles[_] == "admin"
}

is_admin_or_steward {
    input.user.roles[_] == "data_steward"
}

has_elevated_role {
    input.user.roles[_] == "admin"
}

has_elevated_role {
    input.user.roles[_] == "data_steward"
}

has_elevated_role {
    input.user.roles[_] == "data_owner"
}
