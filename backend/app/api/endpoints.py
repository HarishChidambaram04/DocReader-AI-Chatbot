# api/endpoints.py
from fastapi import HTTPException, Depends
import logging
from fastapi import BackgroundTasks
from datetime import datetime
from app.core.firebase_service import firebase_service
from app.core.auth import SessionManager, AuthManager, get_current_user, check_chat_limit

from app.models.schemas import (
    ChatRequest, ChatResponse, Source,
    GoogleTokenRequest, AuthResponse, UserInfo, ChatLimitResponse, PaymentPlaceholder
)
from app.core.rag_engine import rag_engine

logger = logging.getLogger(__name__)

# ============================================
# HEALTH CHECK
# ============================================
async def health_check():
    """Health check endpoint"""
    try:
        if rag_engine.vectordb is None or rag_engine.qa is None:
            return {"status": "unhealthy", "message": "RAG system not initialized"}
        test_docs = rag_engine.vectordb.similarity_search("test", k=1)
        return {"status": "healthy", "message": "RAG Chatbot API is running"}
    except Exception as e:
        return {"status": "unhealthy", "message": f"Error: {str(e)}"}

# ============================================
# CHAT ENDPOINTS
# ============================================
# api/endpoints.py

# Change this line:


# To this:
async def chat(request: ChatRequest, current_user: UserInfo, background_tasks: BackgroundTasks):
        """Main chat endpoint - now saves to Firebase"""
        try:
            logger.info(f"Processing question from user {current_user.email}: {request.message}")
            logger.info(f"Conversation ID: {request.conversation_id}")
            
            conversation_id = request.conversation_id if request.conversation_id != 'default' else f"conv_{current_user.google_id}_{int(datetime.utcnow().timestamp())}"
            logger.info(f"Using conversation ID: {conversation_id}")
            
            # Save user message to Firebase
            user_message_saved = firebase_service.save_message(
                google_id=current_user.google_id,
                conversation_id=conversation_id,
                message_type='user',
                content=request.message
            )
            
            if user_message_saved:
                logger.info("User message saved to Firebase successfully")
            
            # Get answer using RAG
            answer, sources = rag_engine.ask_comprehensive_question(request.message)
            
            # Increment chat count in Firebase
            new_count = firebase_service.increment_chat_count(current_user.google_id)
            remaining_chats = firebase_service.get_remaining_chats(current_user.google_id)
            
            logger.info(f"User {current_user.email} chat count: {new_count}, remaining: {remaining_chats}")
            
            # Save bot response to Firebase
            bot_message_saved = firebase_service.save_message(
                google_id=current_user.google_id,
                conversation_id=conversation_id,
                message_type='bot',
                content=answer,
                sources=sources
            )
            
            if bot_message_saved:
                logger.info("Bot response saved to Firebase successfully")
            
            # ✅ Clean up old conversations in background (now works!)
            background_tasks.add_task(
                firebase_service.cleanup_old_conversations,
                current_user.google_id,
                keep_count=3
            )
            
            # Format sources for response
            formatted_sources = []
            if sources:
                for src in sources:
                    if isinstance(src, dict):
                        formatted_sources.append(Source(
                            document=src.get("document", "Unknown"),
                            content=src.get("content", ""),
                            score=src.get("score")
                        ))
            
            return ChatResponse(
                response=answer,
                sources=formatted_sources,
                conversation_id=conversation_id,
                remaining_chats=remaining_chats,
                chat_count=new_count
            )
            
        except Exception as e:
            logger.error(f"Error processing chat request: {str(e)}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")


async def debug_question(request: ChatRequest, current_user: UserInfo = Depends(get_current_user)):
    """Debug endpoint - requires authentication but no chat limit"""
    try:
        logger.info(f"Debug request from user {current_user.email}: {request.message}")
        answer = rag_engine.debug_rag_response(request.message)
        docs = rag_engine.vectordb.as_retriever(search_kwargs={"k": 4}).get_relevant_documents(request.message)
        
        context_info = []
        for i, doc in enumerate(docs):
            if doc.page_content.strip():
                context_info.append({
                    "doc_id": i+1,
                    "preview": doc.page_content[:100] + "...",
                    "metadata": doc.metadata
                })
        
        return {
            "question": request.message,
            "retrieved_docs_count": len(docs),
            "context_preview": context_info,
            "answer": answer
        }
        
    except Exception as e:
        logger.error(f"Error in debug endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Debug error: {str(e)}")


async def concise_chat(request: ChatRequest, current_user: UserInfo = Depends(check_chat_limit)):
    """Concise answer endpoint"""
    try:
        logger.info(f"Concise chat from user {current_user.email}: {request.message}")
        answer = rag_engine.ask_concise_question(request.message)
        
        return {
            "response": answer,
            "conversation_id": request.conversation_id,
            "mode": "concise"
        }
        
    except Exception as e:
        logger.error(f"Error in concise endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Concise processing error: {str(e)}")

# ============================================
# AUTH ENDPOINTS
# ============================================
async def google_login(request: GoogleTokenRequest):
    """Login with Google OAuth token"""
    try:
        user_info = AuthManager.verify_google_token(request.token)
        logger.info(f"User logged in: {user_info.email}")
        
        SessionManager.create_or_update_session(user_info)
        access_token = AuthManager.create_jwt_token(user_info)
        remaining_chats = firebase_service.get_remaining_chats(user_info.google_id)
        
        return AuthResponse(
            access_token=access_token,
            user=user_info,
            remaining_chats=remaining_chats
        )
        
    except Exception as e:
        logger.error(f"Google login error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Login failed: {str(e)}")


async def get_user_status(current_user: UserInfo):
    """Get current user's status"""
    try:
        user_data = firebase_service.get_user(current_user.google_id)
        remaining_chats = firebase_service.get_remaining_chats(current_user.google_id)
        
        return {
            "user": current_user,
            "chat_count": user_data.get('chat_count', 0) if user_data else 0,
            "remaining_chats": remaining_chats,
            "can_chat": remaining_chats > 0 or remaining_chats == -1,  # ✅ FIXED!
            "is_premium": user_data.get('is_premium', False) if user_data else False,
            "created_at": user_data.get('created_at') if user_data else None,
            "last_activity": user_data.get('last_activity') if user_data else None
        }        
    except Exception as e:
        logger.error(f"Error getting user status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting status: {str(e)}")


async def check_chat_limits(current_user: UserInfo):
    """Check user's chat limits"""
    remaining_chats = firebase_service.get_remaining_chats(current_user.google_id)
    can_chat = remaining_chats > 0 or remaining_chats == -1  # ✅ FIXED!
    
    # ✅ Check if user is premium
    user_data = firebase_service.get_user(current_user.google_id)
    is_premium = user_data.get('is_premium', False) if user_data else False
    
    if not can_chat:
        return ChatLimitResponse(
            message="You've used all free chats. Upgrade to premium to continue.",
            remaining_chats=0,
            is_premium=False
        )
    
    # ✅ Better message for premium users
    if remaining_chats == -1:
        message = "You have unlimited chats (Premium)"
    else:
        message = f"You have {remaining_chats} free chats remaining."
    
    return ChatLimitResponse(
        message=message,
        remaining_chats=remaining_chats,
        is_premium=is_premium  # ✅ FIXED!
    )


async def upgrade_placeholder():
    """Placeholder for payment/upgrade functionality"""
    return PaymentPlaceholder(
        message="Premium upgrade coming soon! This will unlock unlimited chats.",
        upgrade_url=None
    )

# ============================================
# CHAT HISTORY ENDPOINTS
# ============================================
async def get_chat_history(current_user: UserInfo):
    """Get user's chat history"""
    try:
        logger.info(f"Getting chat history for user: {current_user.email} (ID: {current_user.google_id})")
        
        conversations = firebase_service.get_user_conversations(current_user.google_id)
        
        logger.info(f"Retrieved {len(conversations)} conversations for API response")
        
        return {
            "conversations": conversations,
            "total": len(conversations),
            "user_id": current_user.google_id
        }
        
    except Exception as e:
        logger.error(f"Error getting chat history: {str(e)}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting chat history: {str(e)}")


async def get_conversation_messages(conversation_id: str, current_user: UserInfo):
    """Get messages for a specific conversation"""
    try:
        logger.info(f"Getting messages for conversation {conversation_id}, user: {current_user.email}")
        
        messages = firebase_service.get_conversation_messages(conversation_id)
        
        logger.info(f"Retrieved {len(messages)} messages for conversation {conversation_id}")
        
        return {
            "messages": messages,
            "conversation_id": conversation_id,
            "total": len(messages)
        }
        
    except Exception as e:
        logger.error(f"Error getting conversation messages: {str(e)}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting messages: {str(e)}")


async def delete_conversation(conversation_id: str, current_user: UserInfo):
    """Delete a conversation"""
    try:
        logger.info(f"Deleting conversation {conversation_id} for user {current_user.email}")
        
        # Delete the conversation document
        firebase_service.db.collection('conversations').document(conversation_id).delete()
        
        # Delete all messages in the conversation
        messages_ref = firebase_service.db.collection('messages')
        messages_query = messages_ref.where('conversation_id', '==', conversation_id)
        
        deleted_count = 0
        for msg_doc in messages_query.stream():
            msg_doc.reference.delete()
            deleted_count += 1
        
        logger.info(f"Deleted conversation {conversation_id} and {deleted_count} messages")
        
        return {
            "message": "Conversation deleted successfully",
            "conversation_id": conversation_id,
            "messages_deleted": deleted_count
        }
        
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting conversation: {str(e)}")
