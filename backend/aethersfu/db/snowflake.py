import time
import threading
from datetime import datetime, timezone

# Custom Epoch: Jan 1, 2026 00:00:00 UTC (1767225600000 ms)
CUSTOM_EPOCH = 1767225600000

WORKER_ID_BITS = 5
DATACENTER_ID_BITS = 5
SEQUENCE_BITS = 12

MAX_WORKER_ID = -1 ^ (-1 << WORKER_ID_BITS)
MAX_DATACENTER_ID = -1 ^ (-1 << DATACENTER_ID_BITS)

WORKER_ID_SHIFT = SEQUENCE_BITS
DATACENTER_ID_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS
TIMESTAMP_LEFT_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS + DATACENTER_ID_BITS

SEQUENCE_MASK = -1 ^ (-1 << SEQUENCE_BITS)


class SnowflakeGenerator:
    def __init__(self, worker_id: int = 1, datacenter_id: int = 1):
        if worker_id > MAX_WORKER_ID or worker_id < 0:
            raise ValueError(f"worker_id must be between 0 and {MAX_WORKER_ID}")
        if datacenter_id > MAX_DATACENTER_ID or datacenter_id < 0:
            raise ValueError(f"datacenter_id must be between 0 and {MAX_DATACENTER_ID}")

        self.worker_id = worker_id
        self.datacenter_id = datacenter_id
        self.sequence = 0
        self.last_timestamp = -1
        self._lock = threading.Lock()

    def _current_timestamp_ms(self) -> int:
        return int(time.time() * 1000)

    def _wait_next_millis(self, last_timestamp: int) -> int:
        timestamp = self._current_timestamp_ms()
        while timestamp <= last_timestamp:
            timestamp = self._current_timestamp_ms()
        return timestamp

    def next_id(self) -> int:
        with self._lock:
            timestamp = self._current_timestamp_ms()

            if timestamp < self.last_timestamp:
                timestamp = self.last_timestamp

            if self.last_timestamp == timestamp:
                self.sequence = (self.sequence + 1) & SEQUENCE_MASK
                if self.sequence == 0:
                    timestamp = self._wait_next_millis(self.last_timestamp)
            else:
                self.sequence = 0

            self.last_timestamp = timestamp

            snowflake_id = (
                ((timestamp - CUSTOM_EPOCH) << TIMESTAMP_LEFT_SHIFT)
                | (self.datacenter_id << DATACENTER_ID_SHIFT)
                | (self.worker_id << WORKER_ID_SHIFT)
                | self.sequence
            )
            return snowflake_id


_snowflake_generator = SnowflakeGenerator(worker_id=1, datacenter_id=1)


def generate_snowflake_id() -> str:
    """
    Generates a 64-bit time-ordered Snowflake ID formatted as a string.
    Example: '81923749281749281'
    """
    return str(_snowflake_generator.next_id())


def parse_snowflake_timestamp(snowflake_id: str | int) -> datetime:
    """
    Extracts the exact UTC creation datetime directly from a 64-bit Snowflake ID.
    """
    from datetime import datetime, timezone
    sid = int(snowflake_id)
    timestamp_ms = (sid >> TIMESTAMP_LEFT_SHIFT) + CUSTOM_EPOCH
    return datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc)
