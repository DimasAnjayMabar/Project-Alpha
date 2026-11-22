# backend/schemas/product_schemas.py
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ProductStatusRequest(BaseModel):
    active_status: bool


class DisplayImageOrderItem(BaseModel):
    id: str = Field(..., description="ID record product_display_image")
    order: int = Field(..., ge=0, description="Urutan tampil baru")


class ProductDisplayImageResponse(BaseModel):
    id: str
    image_url: str
    public_url: Optional[str] = None
    order: int


class ProductMockupImageResponse(BaseModel):
    id: str
    image_url: str
    public_url: Optional[str] = None


class CategoryAttributeItem(BaseModel):
    id: str
    name: str
    type: str
    required: bool
    order: int


class CategoryWithAttributesResponse(BaseModel):
    id: str
    name: str
    slug: str
    attributes: List[CategoryAttributeItem] = []


class ProductSummaryShop(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    number: Optional[str] = None
    instagram: Optional[str] = None
    online_shop: Optional[str] = None
    gmaps: Optional[str] = None


class ProductResponse(BaseModel):
    id: str
    shop_id: str
    category_id: str
    category_name: Optional[str] = None
    category_slug: Optional[str] = None
    name: str
    price: float
    description: Optional[str] = None
    additional_attribute: Dict = {}
    active_status: bool
    product_link: Optional[str] = None
    display_images: List[ProductDisplayImageResponse] = []
    mockup_image: Optional[ProductMockupImageResponse] = None
    shop: Optional[ProductSummaryShop] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None