from pydantic import BaseModel, EmailStr, ConfigDict

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str | None
    is_admin: bool
    is_active: bool = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserUpdateAdmin(BaseModel):
    is_admin: bool


class UserUpdateProfile(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None


class ChangePassword(BaseModel):
    current_password: str
    new_password: str
