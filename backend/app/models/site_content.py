from typing import Dict
from pydantic import BaseModel, ConfigDict, Field


class SiteContentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    content: Dict[str, str] = Field(default_factory=dict)


class AdminSiteContentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hero_heading: str | None = Field(None, min_length=1, max_length=200)
    hero_description: str | None = Field(None, min_length=1, max_length=1000)
    enter_labs_button: str | None = Field(None, min_length=1, max_length=80)
    scoreboard_button: str | None = Field(None, min_length=1, max_length=80)
    leaderboard_title: str | None = Field(None, min_length=1, max_length=120)
    leaderboard_view_link: str | None = Field(None, min_length=1, max_length=80)
    features_heading: str | None = Field(None, min_length=1, max_length=120)
    features_description: str | None = Field(None, min_length=1, max_length=500)
    feature_labs_title: str | None = Field(None, min_length=1, max_length=120)
    feature_labs_description: str | None = Field(None, min_length=1, max_length=500)
    feature_team_title: str | None = Field(None, min_length=1, max_length=120)
    feature_team_description: str | None = Field(None, min_length=1, max_length=500)
    feature_monitor_title: str | None = Field(None, min_length=1, max_length=120)
    feature_monitor_description: str | None = Field(None, min_length=1, max_length=500)
