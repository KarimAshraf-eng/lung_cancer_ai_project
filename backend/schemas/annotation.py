from pydantic import BaseModel
from typing import Optional

class AnnotationUpdate(BaseModel):
    status: Optional[str] = None # تم جعلها Optional لنتمكن من تعديل الشرائح فقط
    coord_x: Optional[float] = None
    coord_y: Optional[float] = None
    diameter: Optional[float] = None
    start_slice: Optional[int] = None
    end_slice: Optional[int] = None

class AnnotationCreate(BaseModel):
    slice_number: int
    coord_x: float
    coord_y: float
    diameter: float
    start_slice: Optional[int] = None
    end_slice: Optional[int] = None