package opengovern.policies.schema_change_notice

# Policy: Schema Change Notice
# Type: data_contract
# Enforcement: warn
#
# Assets with active data contracts may require advance notice
# before schema changes are applied. This policy warns when a schema
# update is attempted on a contracted asset without proper notice.
#
# Input context.change_notice_satisfied: boolean — was advance notice given?
# Input resource.has_data_contract: boolean — does this asset have an active contract?

default allow = true

# Warn when schema change is attempted on contracted asset without notice
warn[reason] {
    input.action == "update_schema"
    input.resource.has_data_contract == true
    not change_notice_satisfied
    reason := {
        "code": "SCHEMA_CHANGE_NOTICE_REQUIRED",
        "message": sprintf("'%v' has an active data contract that may require advance notice for schema changes. Notify consumers before applying this change.", [input.resource.urn]),
        "policy": "schema_change_notice"
    }
}

# ── Helpers ────────────────────────────────────────────────────────────────────

change_notice_satisfied {
    input.context.change_notice_satisfied == true
}
