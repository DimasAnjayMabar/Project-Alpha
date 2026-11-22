# backend/schemas/shop_schemas.py
from typing import Optional

from pydantic import BaseModel, Field


class ShopRegistrationRequest(BaseModel):
    name: str
    address: str | None = None
    number: str | None = None
    instagram: str | None = None
    online_shop: str | None = None
    gmaps: str | None = None
    description: str | None = None


class ShopUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    address: Optional[str] = None
    number: Optional[str] = Field(None, max_length=20)
    instagram: Optional[str] = Field(None, max_length=255)
    online_shop: Optional[str] = Field(None, max_length=255)
    gmaps: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None


class ShopStatusRequest(BaseModel):
    active_status: bool