from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.database import async_session_maker
from app.models.user import User
from app.schemas.user_schema import UserRead, UserUpdateAdmin, UserCreate
from app.api.auth import get_current_admin_user
from app.core.security import hash_password

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("", status_code=201, response_model=UserRead)
async def create_user(body: UserCreate, _: User = Depends(get_current_admin_user)):
    """Админ создаёт нового пользователя (обычный юзер, не админ)."""
    async with async_session_maker() as session:
        user = User(
            email=body.email,
            hashed_password=hash_password(body.password),
            full_name=body.full_name,
            is_admin=False,
        )
        session.add(user)
        try:
            await session.commit()
            await session.refresh(user)
            return UserRead.model_validate(user)
        except IntegrityError:
            await session.rollback()
            raise HTTPException(status_code=400, detail="User with this email already exists")


@router.get("", response_model=list[UserRead])
async def list_users(_: User = Depends(get_current_admin_user)):
    async with async_session_maker() as session:
        result = await session.execute(select(User).order_by(User.id))
        users = result.scalars().all()
        return [UserRead.model_validate(u) for u in users]


@router.patch("/{user_id}/admin", response_model=UserRead)
async def set_user_admin(
    user_id: int,
    body: UserUpdateAdmin,
    current_admin: User = Depends(get_current_admin_user),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin status")
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.is_admin = body.is_admin
        await session.commit()
        await session.refresh(user)
        return UserRead.model_validate(user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, current_admin: User = Depends(get_current_admin_user)):
    """Удалить пользователя. Нельзя удалить себя."""
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await session.delete(user)
        await session.commit()
