from abc import ABC, abstractmethod
from typing import Any, Dict

from opengovern_connectors.ingestion.api.common import PipelineContext
from opengovern_connectors.ingestion.api.sink import Sink


class PipelineRunListener(ABC):
    @abstractmethod
    def on_start(self, ctx: PipelineContext) -> None:
        # Perform
        pass

    @abstractmethod
    def on_completion(
        self,
        status: str,
        report: Dict[str, Any],
        ctx: PipelineContext,
    ) -> None:
        pass

    @classmethod
    @abstractmethod
    def create(
        cls,
        config_dict: Dict[str, Any],
        ctx: PipelineContext,
        sink: Sink,
    ) -> "PipelineRunListener":
        # Creation and initialization.
        pass
