package opengovern.policies.ownership_required

# Policy: Ownership Required
# Type: access
# Enforcement: warn (no owner), block (certification without owner)
#
# All data assets should have an owner assigned.
# Certification is blocked for assets without an owner.

default allow = true

# Warn when asset has no owner
warn[reason] {
    not input.resource.has_owner
    reason := {
        "code": "NO_OWNER_WARNING",
        "message": sprintf("'%v' has no assigned owner. Assets without owners are not governed properly.", [input.resource.urn]),
        "policy": "ownership_required"
    }
}

# Block certification for ownerless assets
deny[reason] {
    input.action == "certify"
    not input.resource.has_owner
    reason := {
        "code": "OWNER_REQUIRED_FOR_CERTIFICATION",
        "message": "Cannot certify: this asset has no assigned owner. Assign a data owner before certifying.",
        "policy": "ownership_required"
    }
}
