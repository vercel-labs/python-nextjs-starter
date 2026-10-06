from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Literal


class Credentials(BaseModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)


class Registration(Credentials):
    password: str = Field(min_length=15, max_length=128)
    name: str = Field(min_length=1, max_length=80, pattern=r".*\S.*")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    is_admin: bool


class BookInput(BaseModel):
    title: str = Field(min_length=1, max_length=160, pattern=r".*\S.*")
    author: str = Field(min_length=1, max_length=120, pattern=r".*\S.*")
    category: Literal["Fiction", "Essays", "Poetry", "Design", "Science"]
    description: str = Field(min_length=1, max_length=3000, pattern=r".*\S.*")
    price_cents: int = Field(ge=0, le=1000000, strict=True)
    stock: int = Field(ge=0, le=100000, strict=True)
    cover_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    published_year: int = Field(ge=1400, le=2100, strict=True)
    featured: bool = False


class BookOut(BookInput):
    model_config = ConfigDict(from_attributes=True)
    id: str
