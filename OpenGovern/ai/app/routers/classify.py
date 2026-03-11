"""
Classification Router

Auto-classifies data assets and columns for sensitivity (PII, PCI, PHI).
Used by the ingestion pipeline to trigger classification reviews automatically.
"""
import logging
from fastapi import APIRouter, HTTPException

from ..models.classification import (
    ClassifyColumnRequest,
    ColumnClassificationResult,
    ClassifyAssetRequest,
    AssetClassificationResult,
    DataClassification,
)
from ..services.classification_service import ClassificationService

logger = logging.getLogger(__name__)
router = APIRouter()

_classifier = ClassificationService()


@router.post("/column", response_model=ColumnClassificationResult)
async def classify_column(request: ClassifyColumnRequest) -> ColumnClassificationResult:
    """
    Classify a single column's sensitivity level.

    Uses LLM (if configured) or regex pattern matching as fallback.
    Common PII patterns: SSN, email, phone, address, date of birth, name fields.
    Common PCI patterns: credit card, CVV, account number, routing number.
    Common PHI patterns: diagnosis, medication, medical record, insurance.
    """
    try:
        result = await _classifier.classify_column(
            column_name=request.column_name,
            data_type=request.data_type,
            sample_values=request.sample_values,
            table_name=request.table_name,
        )
        return result
    except Exception as e:
        logger.error(f"Classification failed for column '{request.column_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


@router.post("/asset", response_model=AssetClassificationResult)
async def classify_asset(request: ClassifyAssetRequest) -> AssetClassificationResult:
    """
    Classify all columns in a data asset.

    Processes each column in parallel. Returns per-column results plus
    an overall asset sensitivity level (highest classification found).

    requires_review = True when any column is classified with confidence < 0.9,
    meaning a data steward should confirm the classification before it's applied.
    """
    try:
        columns_schema = request.schema.get("columns", [])
        results = []

        for col in columns_schema:
            result = await _classifier.classify_column(
                column_name=col.get("name", ""),
                data_type=col.get("type", "unknown"),
                sample_values=[],  # No sample values in schema aspect
                table_name=request.asset_urn.split(".")[-1],
            )
            results.append(result)

        # Determine overall sensitivity (highest classification)
        sensitivity_order = [
            DataClassification.PII,
            DataClassification.PHI,
            DataClassification.PCI,
            DataClassification.CONFIDENTIAL,
            DataClassification.INTERNAL,
            DataClassification.PUBLIC,
        ]

        overall = DataClassification.INTERNAL
        for order in sensitivity_order:
            if any(r.classification == order for r in results):
                overall = order
                break

        pii_count = sum(
            1 for r in results
            if r.classification in (DataClassification.PII, DataClassification.PHI, DataClassification.PCI)
        )

        requires_review = any(r.confidence < 0.9 for r in results if r.classification != DataClassification.PUBLIC)

        return AssetClassificationResult(
            asset_urn=request.asset_urn,
            columns=results,
            overall_sensitivity=overall,
            pii_column_count=pii_count,
            requires_review=requires_review,
        )
    except Exception as e:
        logger.error(f"Asset classification failed for {request.asset_urn}: {e}")
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")
