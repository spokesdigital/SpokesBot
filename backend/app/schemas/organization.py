from uuid import UUID

from pydantic import BaseModel


class OrganizationResponse(BaseModel):
    id: UUID
    name: str
    created_at: str


class OrganizationCreate(BaseModel):
    name: str
    admin_email: str | None = None


class OrganizationUpdate(BaseModel):
    name: str


class OrganizationMembershipResponse(BaseModel):
    organization: OrganizationResponse
    user_id: UUID
    role: str


class OrgMemberResponse(BaseModel):
    user_id: UUID
    email: str
    role: str
    joined_at: str | None = None


class OrgMemberInvite(BaseModel):
    email: str
    role: str = "user"
