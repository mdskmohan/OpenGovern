package opengovern.policies.lineage_completeness

# Policy: Lineage Completeness
# Type: data_contract
# Enforcement: report (info only — no blocking, no warnings in UI)
#
# Tables with no upstream lineage may be source systems (which is fine)
# or may have undocumented lineage (which is a data governance gap).
# Tables with no downstream lineage may be orphaned (unused).
#
# These are surfaced in compliance reports, not enforced at runtime.

default allow = true

# Info: table with no documented upstream lineage
info[reason] {
    input.resource.entity_type == "table"
    input.resource.upstream_count == 0
    reason := {
        "code": "NO_UPSTREAM_LINEAGE",
        "message": sprintf("'%v' has no documented upstream lineage. If this is a source system, no action needed. Otherwise, consider documenting data origins.", [input.resource.urn]),
        "policy": "lineage_completeness",
        "level": "info"
    }
}

# Info: asset with no downstream consumers (potential orphan)
info[reason] {
    input.resource.entity_type == "table"
    input.resource.downstream_count == 0
    reason := {
        "code": "NO_DOWNSTREAM_LINEAGE",
        "message": sprintf("'%v' has no documented downstream consumers. This asset may be unused and a candidate for deprecation.", [input.resource.urn]),
        "policy": "lineage_completeness",
        "level": "info"
    }
}
