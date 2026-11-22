from pydantic import BaseModel, Field


class ChatQuestionRequest(BaseModel):
    # Batas 500 karakter cukup untuk pertanyaan singkat CS.
    # (Harness sendiri menerima sampai 2000.)
    query: str = Field(..., min_length=1, max_length=500)