# core/auth.py
import jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.oauth2 import id_token
from google.auth.transport import requests
import logging

from ..config.settings import settings
from ..models.schemas import UserInfo
from .firebase_service import firebase_service

logger = logging.getLogger(__name__)

security = HTTPBearer()

class AuthManager:
    @staticmethod
    def verify_google_token(token: str) -> UserInfo:
        """Verify Google OAuth token and return user info"""
        try:
            # Verify the token with Google
            idinfo = id_token.verify_oauth2_token(
                token, 
                requests.Request(), 
                settings.GOOGLE_CLIENT_ID
            )
            
            # Check if the token is from the correct issuer
            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                raise ValueError('Wrong issuer.')
            
            return UserInfo(
                google_id=idinfo['sub'],
                email=idinfo['email'],
                name=idinfo['name'],
                picture=idinfo.get('picture')
            )
            
        except ValueError as e:
            logger.error(f"Google token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token"
            )
    
    @staticmethod
    def create_jwt_token(user_info: UserInfo) -> str:
        """Create JWT token for authenticated user"""
        payload = {
            'sub': user_info.google_id,
            'email': user_info.email,
            'name': user_info.name,
            'exp': datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRATION_HOURS),
            'iat': datetime.utcnow()
        }
        
        return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    
    @staticmethod
    def verify_jwt_token(token: str) -> UserInfo:
        """Verify JWT token and return user info"""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            
            return UserInfo(
                google_id=payload['sub'],
                email=payload['email'],
                name=payload['name'],
                picture=None  # Not stored in JWT for size reasons
            )
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        except jwt.JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

class SessionManager:
    @staticmethod
    def create_or_update_session(user_info: UserInfo) -> bool:
        """Create or update user session in Firebase"""
        return firebase_service.create_or_update_user(user_info)
    
    @staticmethod
    def get_remaining_chats(google_id: str) -> int:
        """Get remaining free chats for user from Firebase"""
        return firebase_service.get_remaining_chats(google_id)
    
    @staticmethod
    def can_chat(google_id: str) -> bool:
        """Check if user can send more chats"""
        return firebase_service.can_user_chat(google_id)
    
    @staticmethod
    def increment_chat_count(google_id: str) -> int:
        """Increment user's chat count in Firebase"""
        return firebase_service.increment_chat_count(google_id)

# Dependency to get current authenticated user
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserInfo:
    """FastAPI dependency to get current authenticated user"""
    token = credentials.credentials
    return AuthManager.verify_jwt_token(token)

# Dependency to check if user can chat
async def check_chat_limit(current_user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """
    Check if user can send messages
    Premium users have unlimited chats
    """
    try:
        # ✅ Check if user is premium first
        is_premium = firebase_service.is_premium_user(current_user.google_id)
        
        if is_premium:
            logger.info(f"✅ Premium user {current_user.email} - unlimited chats")
            return current_user  # Allow chat
        
        # Free user - check limit
        remaining = firebase_service.get_remaining_chats(current_user.google_id)
        
        if remaining <= 0:
            logger.warning(f"⛔ User {current_user.email} has no chats remaining")
            raise HTTPException(
                status_code=403,
                detail={
                    "message": "You've used all your free chats. Upgrade to premium for unlimited access!",
                    "remaining_chats": 0,
                    "is_premium": False,
                    "upgrade_required": True
                }
            )
        
        logger.info(f"✅ User {current_user.email} has {remaining} chats remaining")
        return current_user
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking chat limit: {e}")
        raise HTTPException(status_code=500, detail="Error checking chat limits")