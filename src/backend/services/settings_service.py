from sqlmodel import Session, select

from src.backend import config
from src.backend.models import SystemSetting
from src.backend.utils.datetime_utils import utc_now


ALLOW_PUBLIC_ROLE_REGISTRATION_KEY = "allow_public_role_registration"


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_bool_setting(session: Session, key: str, default: bool) -> bool:
    setting = session.exec(select(SystemSetting).where(SystemSetting.key == key)).first()
    if not setting:
        return default
    return _parse_bool(setting.value, default)


def set_bool_setting(session: Session, key: str, value: bool) -> bool:
    setting = session.exec(select(SystemSetting).where(SystemSetting.key == key)).first()
    if not setting:
        setting = SystemSetting(key=key, value="true" if value else "false")
    else:
        setting.value = "true" if value else "false"
        setting.updated_at = utc_now()
    session.add(setting)
    session.commit()
    return value


def get_allow_public_role_registration(session: Session) -> bool:
    return get_bool_setting(
        session=session,
        key=ALLOW_PUBLIC_ROLE_REGISTRATION_KEY,
        default=config.ALLOW_PUBLIC_ROLE_REGISTRATION,
    )
