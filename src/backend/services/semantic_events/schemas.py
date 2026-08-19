from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class EventType(StrEnum):
    QUESTION = "QUESTION"
    ANSWER = "ANSWER"
    EXAMPLE = "EXAMPLE"
    TOPIC_CHANGE = "TOPIC_CHANGE"
    IMPORTANT = "IMPORTANT"
    ACTION = "ACTION"
    DEADLINE = "DEADLINE"
    EXAM_CUE = "EXAM_CUE"


class InferenceType(StrEnum):
    EXPLICIT = "EXPLICIT"
    INFERRED = "INFERRED"


class CreatedBy(StrEnum):
    AI = "AI"
    HUMAN = "HUMAN"


class ReviewStatus(StrEnum):
    UNREVIEWED = "UNREVIEWED"
    CONFIRMED = "CONFIRMED"
    CORRECTED = "CORRECTED"
    REJECTED = "REJECTED"


EXPLICIT_EVENT_TYPES = frozenset(
    {
        EventType.QUESTION,
        EventType.ANSWER,
        EventType.EXAMPLE,
        EventType.ACTION,
        EventType.DEADLINE,
        EventType.EXAM_CUE,
    }
)
INFERRED_EVENT_TYPES = frozenset({EventType.TOPIC_CHANGE, EventType.IMPORTANT})


class TranscriptSegment(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    segment_index: int = Field(ge=0)
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str

    @model_validator(mode="after")
    def validate_timeline(self):
        if self.end < self.start:
            raise ValueError("segment end must be greater than or equal to start")
        return self


class TranscriptChunk(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    chunk_id: str
    start_segment_index: int = Field(ge=0)
    end_segment_index: int = Field(ge=0)
    start_time: float = Field(ge=0)
    end_time: float = Field(ge=0)
    segments: list[TranscriptSegment]

    @model_validator(mode="after")
    def validate_chunk(self):
        if not self.segments:
            raise ValueError("chunk must contain at least one segment")
        if self.end_segment_index < self.start_segment_index:
            raise ValueError("chunk index range is invalid")
        if self.end_time < self.start_time:
            raise ValueError("chunk time range is invalid")
        indices = [segment.segment_index for segment in self.segments]
        if indices != list(range(self.start_segment_index, self.end_segment_index + 1)):
            raise ValueError("chunk segment indices must be contiguous and ordered")
        return self


class ProviderEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: EventType
    start_segment_index: int
    end_segment_index: int
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    confidence: float = Field(ge=0, le=1)

    @field_validator("title", "description", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> str:
        return str(value or "").strip()


class EventExtractionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[ProviderEvent] = Field(default_factory=list)


class GroundedEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_type: EventType
    start_time: float = Field(ge=0)
    end_time: float = Field(ge=0)
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    confidence: float = Field(ge=0, le=1)
    inference_type: InferenceType
    source_segment_ids: list[int] = Field(min_length=1)
    created_by: CreatedBy = CreatedBy.AI
    review_status: ReviewStatus = ReviewStatus.UNREVIEWED


class ChunkExtractionResult(BaseModel):
    chunk_id: str
    events: list[GroundedEvent] = Field(default_factory=list)
    raw_event_count: int = 0
    rejected_event_count: int = 0
    failed: bool = False
    attempts: int = 0
    error_code: str | None = None


class LectureProcessingResult(BaseModel):
    video_id: str
    segment_count: int
    chunk_count: int
    processed_chunks: int
    failed_chunks: int
    raw_extracted_events: int
    validation_rejected_events: int
    deduplicated_events: int
    persisted_events: int
    events_created: int
    processing_latency_ms: float
