from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DB_HOST: str
    DB_PORT: int
    DB_USER: str
    DB_PASS: str
    DB_NAME: str

    SECRET_KEY: str
    ALGORITHM:  str
    ML_SERVICE_URL: str = "http://ml:8001"

    class Config:
        env_file=".env"

settings=Settings()
