"""
Data classification service.
Classifies columns into PII / PCI / PHI / PUBLIC sensitivity categories.

Two strategies:
- LLM-based: uses GPT with few-shot examples for nuanced understanding
- Regex-based fallback: pattern matching on column names when no OpenAI key
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.config.settings import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Domain types
# ──────────────────────────────────────────────────────────────────────────────

CATEGORY_PII = "PII"
CATEGORY_PCI = "PCI"
CATEGORY_PHI = "PHI"
CATEGORY_PUBLIC = "PUBLIC"

VALID_CATEGORIES = {CATEGORY_PII, CATEGORY_PCI, CATEGORY_PHI, CATEGORY_PUBLIC}


@dataclass
class ClassificationResult:
    category: str
    confidence: float
    reasoning: str
    tags: List[str] = field(default_factory=list)


@dataclass
class ColumnClassification:
    column_name: str
    data_type: str
    category: str
    confidence: float
    reasoning: str
    tags: List[str] = field(default_factory=list)

    def dict(self) -> Dict[str, Any]:
        return {
            "column_name": self.column_name,
            "data_type": self.data_type,
            "category": self.category,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "tags": self.tags,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Regex-based classifier (no API key needed)
# ──────────────────────────────────────────────────────────────────────────────

# Maps category → list of regex patterns matching column names
_REGEX_RULES: Dict[str, List[re.Pattern]] = {
    CATEGORY_PII: [
        re.compile(r"\b(first|last|full|given|family|middle)[\s_]?name\b", re.I),
        re.compile(r"\bname\b", re.I),
        re.compile(r"\bemail([\s_]?address)?\b", re.I),
        re.compile(r"\bphone([\s_]?number)?\b", re.I),
        re.compile(r"\bmobile\b", re.I),
        re.compile(r"\bssn\b|social[\s_]?security", re.I),
        re.compile(r"\bpassport\b", re.I),
        re.compile(r"\bdriver[\s_]?licen[sc]e\b", re.I),
        re.compile(r"\b(home|billing|mailing|street)[\s_]?address\b", re.I),
        re.compile(r"\bzip([\s_]?code)?\b", re.I),
        re.compile(r"\bdate[\s_]?of[\s_]?birth\b|\bdob\b|\bbirthdate\b", re.I),
        re.compile(r"\bip[\s_]?address\b", re.I),
        re.compile(r"\bgeo[\s_]?(location|lat|lon)\b", re.I),
        re.compile(r"\buser[\s_]?id\b|\bperson[\s_]?id\b|\bcustomer[\s_]?id\b", re.I),
        re.compile(r"\bgender\b|\bsex\b|\bethnicity\b|\brace\b|\bnationality\b", re.I),
    ],
    CATEGORY_PCI: [
        re.compile(r"\bcredit[\s_]?card\b|\bcard[\s_]?number\b|\bpan\b", re.I),
        re.compile(r"\bcvv\b|\bcvc\b|\bcvv2\b", re.I),
        re.compile(r"\bcard[\s_]?expir(y|ation)\b", re.I),
        re.compile(r"\baccount[\s_]?number\b", re.I),
        re.compile(r"\brouting[\s_]?number\b|\bbank[\s_]?account\b", re.I),
        re.compile(r"\biban\b|\bswift\b", re.I),
    ],
    CATEGORY_PHI: [
        re.compile(r"\bmedical[\s_]?record\b|\bmrn\b", re.I),
        re.compile(r"\bdiagnos(is|es)\b|\bicd[\s_]?code\b", re.I),
        re.compile(r"\bmedication\b|\bprescription\b", re.I),
        re.compile(r"\bhealth[\s_]?insurance\b|\binsurance[\s_]?id\b", re.I),
        re.compile(r"\bpatient[\s_]?id\b", re.I),
        re.compile(r"\bblood[\s_]?type\b|\blab[\s_]?result\b", re.I),
        re.compile(r"\btreatment\b|\bprocedure\b|\bsurgery\b", re.I),
        re.compile(r"\bhipaa\b|\bphi\b", re.I),
    ],
}


def _classify_by_regex(
    column_name: str,
    data_type: str,
    sample_values: Optional[List[str]] = None,
) -> ClassificationResult:
    """Fast rule-based classification using column name patterns."""
    for category, patterns in _REGEX_RULES.items():
        for pattern in patterns:
            if pattern.search(column_name):
                return ClassificationResult(
                    category=category,
                    confidence=0.75,
                    reasoning=f"Column name '{column_name}' matched {category} pattern.",
                    tags=[category.lower()],
                )

    # Nothing matched - it's public / non-sensitive
    return ClassificationResult(
        category=CATEGORY_PUBLIC,
        confidence=0.9,
        reasoning="No sensitive data patterns detected in column name.",
        tags=[],
    )


# ──────────────────────────────────────────────────────────────────────────────
# LLM-based classifier
# ──────────────────────────────────────────────────────────────────────────────

_FEW_SHOT_EXAMPLES = [
    {"column": "email_address", "type": "varchar", "category": "PII", "reason": "Contains email addresses"},
    {"column": "ssn", "type": "char(9)", "category": "PII", "reason": "Social Security Number"},
    {"column": "credit_card_number", "type": "varchar", "category": "PCI", "reason": "Payment card number"},
    {"column": "cvv", "type": "char(3)", "category": "PCI", "reason": "Card verification value"},
    {"column": "diagnosis_code", "type": "varchar", "category": "PHI", "reason": "Medical diagnosis ICD code"},
    {"column": "patient_id", "type": "integer", "category": "PHI", "reason": "Healthcare patient identifier"},
    {"column": "product_name", "type": "varchar", "category": "PUBLIC", "reason": "Non-sensitive product data"},
    {"column": "order_total", "type": "decimal", "category": "PUBLIC", "reason": "Aggregate transaction amount"},
]

_SYSTEM_PROMPT = """You are a data governance expert specialising in data classification.
Classify database columns into exactly one of these sensitivity categories:
- PII: Personally Identifiable Information (names, emails, phone, SSN, address, DOB, IP address)
- PCI: Payment Card Industry data (credit cards, CVV, bank accounts, routing numbers)
- PHI: Protected Health Information (medical records, diagnoses, medications, patient IDs)
- PUBLIC: Non-sensitive data safe for unrestricted access

Respond ONLY with valid JSON in this exact format:
{"category": "PII|PCI|PHI|PUBLIC", "confidence": 0.0-1.0, "reasoning": "brief explanation", "tags": ["list", "of", "relevant", "tags"]}"""


def _classify_by_llm(
    column_name: str,
    data_type: str,
    sample_values: Optional[List[str]] = None,
) -> ClassificationResult:
    """LLM-based classification with few-shot examples for high accuracy."""
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    few_shot_text = "\n".join(
        f"Column: {ex['column']} ({ex['type']}) → {ex['category']}: {ex['reason']}"
        for ex in _FEW_SHOT_EXAMPLES
    )

    user_message = f"""Examples:
{few_shot_text}

Now classify this column:
Column name: {column_name}
Data type: {data_type}
"""
    if sample_values:
        safe_samples = [str(v)[:50] for v in sample_values[:5]]
        user_message += f"Sample values (may be masked): {', '.join(safe_samples)}\n"

    try:
        response = client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0,
            max_tokens=200,
        )

        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)

        category = data.get("category", CATEGORY_PUBLIC)
        if category not in VALID_CATEGORIES:
            category = CATEGORY_PUBLIC

        return ClassificationResult(
            category=category,
            confidence=float(data.get("confidence", 0.8)),
            reasoning=data.get("reasoning", ""),
            tags=data.get("tags", []),
        )
    except Exception as exc:
        logger.warning("LLM classification failed for '%s': %s - falling back to regex", column_name, exc)
        return _classify_by_regex(column_name, data_type, sample_values)


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def classify_column(
    column_name: str,
    data_type: str,
    sample_values: Optional[List[str]] = None,
) -> ClassificationResult:
    """Classify a single column. Uses LLM when available, regex otherwise."""
    if settings.has_openai:
        return _classify_by_llm(column_name, data_type, sample_values)
    return _classify_by_regex(column_name, data_type, sample_values)


def classify_asset(
    asset_urn: str,
    schema: Dict[str, Any],
) -> List[ColumnClassification]:
    """Classify all columns in an asset schema.

    schema expected format:
      {"columns": [{"name": str, "data_type": str, "sample_values": [...]}, ...]}
    """
    columns = schema.get("columns") or []
    results: List[ColumnClassification] = []

    for col in columns:
        col_name = col.get("name", "")
        col_type = col.get("data_type", "unknown")
        samples = col.get("sample_values") or []

        classification = classify_column(col_name, col_type, samples)
        results.append(
            ColumnClassification(
                column_name=col_name,
                data_type=col_type,
                category=classification.category,
                confidence=classification.confidence,
                reasoning=classification.reasoning,
                tags=classification.tags,
            )
        )

    return results


class ClassificationService:
    """Class wrapper for dependency-injection style usage in routers."""

    async def classify_column(self, column_name: str, data_type: str, sample_values: list | None = None, table_name: str | None = None):
        return classify_column(column_name=column_name, data_type=data_type, sample_values=sample_values or [], table_name=table_name)

    async def classify_asset(self, asset_urn: str, schema: dict):
        return classify_asset(asset_urn=asset_urn, schema=schema)
