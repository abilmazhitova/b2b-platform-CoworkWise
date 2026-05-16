from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.database import async_session_maker
from app.models.user import User
from app.schemas.user_schema import UserCreate, UserLogin, LoginResponse, UserRead, UserUpdateProfile, ChangePassword
from app.core.security import hash_password, verify_password, create_access_token, decode_token

router = APIRouter(prefix="/auth", tags=["Auth"])

security = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> User:
    token = credentials.credentials if credentials else None
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    email = payload["sub"]
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user



@router.post("/register", status_code=201)
async def register(user_data: UserCreate):
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == user_data.email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="User already exists")

        new_user = User(
            email=user_data.email,
            hashed_password=hash_password(user_data.password),
            full_name=user_data.full_name
        )
        session.add(new_user)
        await session.commit()
        return {"message": "User created successfully"}



@router.post("/login", response_model=LoginResponse)
async def login(user_data: UserLogin):
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == user_data.email))
        user = result.scalar_one_or_none()

        if not user or not verify_password(user_data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = create_access_token({"sub": user.email})
        return LoginResponse(access_token=token, user=UserRead.model_validate(user))



@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)):
    return UserRead.model_validate(current_user)



@router.patch("/me", response_model=UserRead)
async def update_me(body: UserUpdateProfile, current_user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == current_user.id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if body.full_name is not None:
            user.full_name = body.full_name
        if body.email is not None:
            existing = await session.execute(select(User).where(and_(User.email == body.email, User.id != current_user.id)))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Email already taken")
            user.email = body.email
        await session.commit()
        await session.refresh(user)
        return UserRead.model_validate(user)



@router.post("/change-password")
async def change_password(body: ChangePassword, current_user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == current_user.id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if not verify_password(body.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is wrong")
        user.hashed_password = hash_password(body.new_password)
        await session.commit()
        return {"message": "Password updated"}
