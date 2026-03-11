import logging
from typing import Iterable, Optional

from pydantic.fields import Field

from opengovern_connectors.configuration.common import ConfigModel
from opengovern_connectors.emitter.mce_builder import set_aspect
from opengovern_connectors.emitter.mcp import MetadataChangeProposalWrapper
from opengovern_connectors.ingestion.api.source_helpers import create_dataset_props_patch_builder
from opengovern_connectors.ingestion.api.workunit import MetadataWorkUnit
from opengovern_connectors.metadata.schema_classes import (
    DatasetPropertiesClass,
    MetadataChangeEventClass,
    SystemMetadataClass,
)

logger = logging.getLogger(__name__)


def convert_dataset_properties_to_patch(
    urn: str,
    aspect: DatasetPropertiesClass,
    system_metadata: Optional[SystemMetadataClass],
) -> MetadataWorkUnit:
    patch_builder = create_dataset_props_patch_builder(urn, aspect, system_metadata)
    mcp = next(iter(patch_builder.build()))
    return MetadataWorkUnit(id=MetadataWorkUnit.generate_workunit_id(mcp), mcp_raw=mcp)


def auto_incremental_properties(
    incremental_properties: bool,
    stream: Iterable[MetadataWorkUnit],
) -> Iterable[MetadataWorkUnit]:
    if not incremental_properties:
        yield from stream
        return  # early exit

    for wu in stream:
        urn = wu.get_urn()

        if isinstance(wu.metadata, MetadataChangeEventClass):
            properties_aspect = wu.get_aspect_of_type(DatasetPropertiesClass)
            set_aspect(wu.metadata, None, DatasetPropertiesClass)
            if len(wu.metadata.proposedSnapshot.aspects) > 0:
                yield wu

            if properties_aspect:
                yield convert_dataset_properties_to_patch(
                    urn, properties_aspect, wu.metadata.systemMetadata
                )
        elif isinstance(wu.metadata, MetadataChangeProposalWrapper) and isinstance(
            wu.metadata.aspect, DatasetPropertiesClass
        ):
            properties_aspect = wu.metadata.aspect
            if properties_aspect:
                yield convert_dataset_properties_to_patch(
                    urn, properties_aspect, wu.metadata.systemMetadata
                )
        else:
            yield wu


# TODO: Use this in SQLCommonConfig. Currently only used in snowflake
class IncrementalPropertiesConfigMixin(ConfigModel):
    incremental_properties: bool = Field(
        default=False,
        description="When enabled, emits dataset properties as incremental to existing dataset properties "
        "in DataHub. When disabled, re-states dataset properties on each run.",
    )
