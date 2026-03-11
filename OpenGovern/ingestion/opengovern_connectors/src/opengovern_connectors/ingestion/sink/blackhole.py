import logging

from opengovern_connectors.configuration.common import ConfigModel
from opengovern_connectors.ingestion.api.common import RecordEnvelope
from opengovern_connectors.ingestion.api.sink import Sink, SinkReport, WriteCallback

logger = logging.getLogger(__name__)


class BlackHoleSink(Sink[ConfigModel, SinkReport]):
    def write_record_async(
        self, record_envelope: RecordEnvelope, write_callback: WriteCallback
    ) -> None:
        if write_callback:
            self.report.report_record_written(record_envelope)
            write_callback.on_success(record_envelope, {})
