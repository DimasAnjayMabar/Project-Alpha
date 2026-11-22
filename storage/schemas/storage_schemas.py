# storage/schemas/storage_schemas.py
from typing import List
from pydantic import BaseModel, Field


class DeleteFilesRequest(BaseModel):
    paths: List[str] = Field(
        ...,
        min_length=1,
        description="Daftar path relatif (misal: uploads/products/display/abc.webp)",
    )