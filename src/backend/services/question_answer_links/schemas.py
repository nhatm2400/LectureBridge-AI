from dataclasses import dataclass
from enum import StrEnum
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.backend.models import LectureEvent
from src.backend.services.semantic_events.schemas import EventType


class RelationType(StrEnum):
    QUESTION_ANSWER = "QUESTION_ANSWER"


@dataclass(frozen=True)
class QuestionCandidateSet:
    question: LectureEvent
    answers: tuple[LectureEvent, ...]


class ProviderLink(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_event_id: uuid.UUID
    answer_event_id: uuid.UUID
    confidence: float = Field(ge=0, le=1)


class ProviderLinkResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    links: list[ProviderLink] = Field(default_factory=list)


class QuestionAnswerProcessingResult(BaseModel):
    video_id: str
    questions_considered: int
    candidate_pairs: int
    processed_questions: int
    failed_questions: int
    relations_created: int
    relations_preserved: int
    relations_rejected: int
    processing_latency_ms: float


class EventReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review_status: str
    event_type: EventType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None

    @field_validator("review_status")
    @classmethod
    def validate_review_status(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in {"CONFIRMED", "CORRECTED", "REJECTED"}:
            raise ValueError("review_status must be CONFIRMED, CORRECTED, or REJECTED")
        return normalized

    @field_validator("title", "description", mode="before")
    @classmethod
    def normalize_text(cls, value):
        return None if value is None else str(value).strip()

    @model_validator(mode="after")
    def validate_correction(self):
        correction_supplied = any(
            value is not None
            for value in (self.event_type, self.title, self.description)
        )
        if self.review_status == "CORRECTED" and not correction_supplied:
            raise ValueError("CORRECTED requires at least one corrected field")
        if self.review_status != "CORRECTED" and correction_supplied:
            raise ValueError("content fields are allowed only for CORRECTED reviews")
        return self


class RelationReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review_status: str
    target_event_id: uuid.UUID | None = None

    @field_validator("review_status")
    @classmethod
    def validate_review_status(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in {"CONFIRMED", "CORRECTED", "REJECTED"}:
            raise ValueError("review_status must be CONFIRMED, CORRECTED, or REJECTED")
        return normalized

    @model_validator(mode="after")
    def validate_correction(self):
        if self.target_event_id is not None and self.review_status != "CORRECTED":
            raise ValueError("target_event_id can be changed only with CORRECTED")
        if self.review_status == "CORRECTED" and self.target_event_id is None:
            raise ValueError("CORRECTED requires target_event_id")
        return self


class ManualRelationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_event_id: uuid.UUID
    target_event_id: uuid.UUID
    relation_type: RelationType = RelationType.QUESTION_ANSWER
