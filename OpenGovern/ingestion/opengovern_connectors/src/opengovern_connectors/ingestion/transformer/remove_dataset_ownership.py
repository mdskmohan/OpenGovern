from typing import Optional, cast

from opengovern_connectors.configuration.common import ConfigModel
from opengovern_connectors.emitter.mce_builder import Aspect
from opengovern_connectors.ingestion.api.common import PipelineContext
from opengovern_connectors.ingestion.transformer.dataset_transformer import OwnershipTransformer
from opengovern_connectors.metadata.schema_classes import OwnershipClass


class ClearDatasetOwnershipConfig(ConfigModel):
    pass


class SimpleRemoveDatasetOwnership(OwnershipTransformer):
    """Transformer that clears all owners on each dataset."""

    def __init__(self, config: ClearDatasetOwnershipConfig, ctx: PipelineContext):
        super().__init__()

    @classmethod
    def create(
        cls, config_dict: dict, ctx: PipelineContext
    ) -> "SimpleRemoveDatasetOwnership":
        config = ClearDatasetOwnershipConfig.model_validate(config_dict)
        return cls(config, ctx)

    def transform_aspect(
        self, entity_urn: str, aspect_name: str, aspect: Optional[Aspect]
    ) -> Optional[Aspect]:
        in_ownership_aspect = cast(OwnershipClass, aspect)
        if in_ownership_aspect is None:
            return None

        in_ownership_aspect.owners = []
        return cast(Aspect, in_ownership_aspect)
