from pydantic import BaseModel

class OAuthLoginRequest(BaseModel):
    email: str
    oauth_provider: str = "google"
    oauth_id: str
    display_name: str | None = None
    profile: str | None = None