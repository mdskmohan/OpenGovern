from typing import Optional

import pydantic

from opengovern_connectors.configuration.time_window_config import BucketDuration
from opengovern_connectors.ingestion.source.state.checkpoint import CheckpointStateBase
from opengovern_connectors.utilities.time import TimeWindow, ts_millis_to_datetime


class BaseTimeWindowCheckpointState(CheckpointStateBase):
    """
    Base class for representing the checkpoint state for all time window based ingestion stages.
    Stores the last successful run's begin and end timestamps.
    Subclasses can define additional state as appropriate.
    """

    begin_timestamp_millis: pydantic.NonNegativeInt
    end_timestamp_millis: pydantic.NonNegativeInt

    # Required for time bucket based aggregations -  e.g. Usage
    bucket_duration: Optional[BucketDuration] = None

    def to_time_interval(self) -> TimeWindow:
        return TimeWindow(
            ts_millis_to_datetime(self.begin_timestamp_millis),
            ts_millis_to_datetime(self.end_timestamp_millis),
        )
