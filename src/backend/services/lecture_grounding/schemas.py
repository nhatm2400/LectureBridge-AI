from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


CONTEXT_ITEM_TYPE_VALUES = (
    "TOPIC_CHANGE",
    "QUESTION_ANSWER",
    "QUESTION",
    "ANSWER",
    "EXAMPLE",
    "IMPORTANT",
    "ACTION",
    "DEADLINE",
    "EXAM_CUE",
    "TRANSCRIPT",
)


class EvidenceUnit(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    evidence_id: str
    kind: Literal["event", "relation", "segment"]
    text: str
    start_time: float = Field(ge=0)
    end_time: float = Field(ge=0)
    source_event_ids: list[str] = Field(default_factory=list)
    source_segment_ids: list[int] = Field(default_factory=list)
    event_type: str | None = None
    priority: int = 0


class ContextRecoveryRequest(BaseModel):
    current_time: float = Field(ge=0)
    window_seconds: int = Field(default=300, ge=120, le=600)
    output_language: Literal["vi", "en"] = "vi"


class ProviderContextItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(min_length=1, max_length=32)
    text: str = Field(min_length=1, max_length=1000)
    source_event_ids: list[str] = Field(default_factory=list)
    source_segment_ids: list[int] = Field(default_factory=list)

    @field_validator("type", "text", mode="before")
    @classmethod
    def strip_text(cls, value):
        return str(value or "").strip()


class ProviderContextResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(default="", max_length=1500)
    items: list[ProviderContextItem] = Field(default_factory=list)


class ContextRecoveryItem(ProviderContextItem):
    timestamp: float = Field(ge=0)


class ContextRecoveryResponse(BaseModel):
    video_id: str
    summary: str
    items: list[ContextRecoveryItem]
    supported: bool
    metrics: dict[str, int | float]


class AskLectureRequest(BaseModel):
    question: str = Field(min_length=1)
    output_language: Literal["vi", "en"] = "vi"

    @field_validator("question", mode="before")
    @classmethod
    def normalize_question(cls, value):
        return str(value or "").strip()


class ProviderAskResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(default="", max_length=4000)
    used_evidence_ids: list[str] = Field(default_factory=list)
    supported: bool = False


class LectureCitation(BaseModel):
    evidence_id: str
    timestamp: float = Field(ge=0)
    end_time: float = Field(ge=0)
    source_event_ids: list[str]
    source_segment_ids: list[int]


class AskLectureResponse(BaseModel):
    video_id: str
    answer: str
    supported: bool
    citations: list[LectureCitation]
    evidence_count: int
