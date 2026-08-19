from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from src.backend import config
from src.backend.auth import create_access_token, get_current_user, get_password_hash, verify_password
from src.backend.database import get_session
from src.backend.models import User, Role, Profile
from src.backend.schemas.auth import LoginResult, UserCreate
from src.backend.services.rate_limit_service import rate_limit
from src.backend.services.settings_service import get_allow_public_role_registration

router = APIRouter(prefix="/api/auth", tags=["auth"])

ALLOWED_ROLES = {"student", "teacher", "admin"}


def _allow_public_role_registration(session: Session) -> bool:
    return get_allow_public_role_registration(session)


@router.get("/registration-config")
async def registration_config(session: Session = Depends(get_session)):
    allow_public_role_registration = _allow_public_role_registration(session)
    return {
        "allow_role_registration": allow_public_role_registration,
        "roles": sorted(ALLOWED_ROLES) if allow_public_role_registration else ["student"],
    }


@router.post("/register", response_model=dict)
async def register(user_data: UserCreate, session: Session = Depends(get_session)):
    requested_role = (user_data.role or "student").strip().lower()

    role_name = requested_role if _allow_public_role_registration(session) else "student"

    if role_name not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid user role.")

    statement = select(User).where(User.email == user_data.email)
    existing_user = session.exec(statement).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already in use.")

    # Find role by name
    role_stmt = select(Role).where(Role.name == role_name)
    role = session.exec(role_stmt).first()
    if not role:
        # Fallback create role if not exists (for dev convenience)
        role = Role(name=role_name)
        session.add(role)
        session.flush()

    new_user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        role_id=role.id,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    
    # Create profile automatically
    profile = Profile(user_id=new_user.id)
    session.add(profile)
    session.commit()
    
    return {"message": "Registration successful", "user_id": new_user.id}


@router.post("/login", response_model=LoginResult)
async def login(
    _: None = Depends(rate_limit("login", config.LOGIN_RATE_LIMIT)),
    form_data: OAuth2PasswordRequestForm = Depends(),
    response: Response = None,
    session: Session = Depends(get_session),
):
    statement = select(User).where(User.email == form_data.username, User.is_deleted == False)  # noqa: E712
    user = session.exec(statement).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if user.email.lower() in config.ADMIN_EMAILS:
        role_stmt = select(Role).where(Role.name == "admin")
        admin_role = session.exec(role_stmt).first()
        if not admin_role:
            admin_role = Role(name="admin")
            session.add(admin_role)
            session.flush()
        if user.role_id != admin_role.id:
            user.role_id = admin_role.id
            session.add(user)
            session.commit()
            session.refresh(user)

    access_token = create_access_token(data={"sub": user.email})
    if response is not None:
        response.set_cookie(
            key=config.AUTH_COOKIE_NAME,
            value=access_token,
            httponly=True,
            secure=config.AUTH_COOKIE_SECURE,
            samesite=config.AUTH_COOKIE_SAMESITE,
            max_age=config.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
        )
    
    role_name = (user.role.name if user.role else "student").lower()
    return {"role": role_name}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        key=config.AUTH_COOKIE_NAME,
        path="/",
        secure=config.AUTH_COOKIE_SECURE,
        samesite=config.AUTH_COOKIE_SAMESITE,
    )
    return {"message": "Logged out"}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    role_name = (current_user.role.name if current_user.role else "student").lower()
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": role_name,
    }
