package opengovern.policies.quality_threshold

# Policy: Data Quality Thresholds
# Type: quality
# Enforcement: warn (below 70), block (certification with score < 80)
#
# Ensures that:
#   - Assets with quality score < 70 show a warning to users
#   - Assets with quality score < 80 cannot be certified

default allow = true

# Warn when quality score is below the warning threshold
warn[reason] {
    input.resource.quality_score != null
    input.resource.quality_score < 70
    reason := {
        "code": "LOW_QUALITY_WARNING",
        "message": sprintf("Asset quality score is %.1f (below warning threshold of 70). Data may not be reliable.", [input.resource.quality_score]),
        "quality_score": input.resource.quality_score,
        "policy": "quality_threshold"
    }
}

# Block certification when quality score is below the certification threshold
deny[reason] {
    input.action == "certify"
    input.resource.quality_score != null
    input.resource.quality_score < 80
    reason := {
        "code": "INSUFFICIENT_QUALITY_FOR_CERTIFICATION",
        "message": sprintf("Cannot certify: quality score %.1f is below the required threshold of 80. Improve data quality first.", [input.resource.quality_score]),
        "quality_score": input.resource.quality_score,
        "required_score": 80,
        "policy": "quality_threshold"
    }
}

# Block certification when quality score is missing (unknown)
deny[reason] {
    input.action == "certify"
    input.resource.quality_score == null
    reason := {
        "code": "NO_QUALITY_SCORE_FOR_CERTIFICATION",
        "message": "Cannot certify: no quality score has been computed for this asset. Run a quality check first.",
        "policy": "quality_threshold"
    }
}
