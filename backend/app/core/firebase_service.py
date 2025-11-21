import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
from typing import Optional, Dict, List
import logging
import os

from ..models.schemas import UserInfo, UserSession

logger = logging.getLogger(__name__)

class FirebaseService:
    def __init__(self):
        self.db = None
        self.initialized = False
    
    def initialize(self):
        """Initialize Firebase Admin SDK"""
        try:
            # Path to your service account key
            cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "./firebase-credentials.json")
            
            if not os.path.exists(cred_path):
                logger.error(f"Firebase credentials file not found at {cred_path}")
                return False
            
            # Initialize Firebase Admin SDK
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            
            # Get Firestore client
            self.db = firestore.client()
            self.initialized = True
            
            logger.info("Firebase initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Firebase initialization error: {e}")
            return False
    
    def get_user(self, google_id: str) -> Optional[Dict]:
        """Get user from Firestore"""
        if not self.initialized:
            return None
            
        try:
            user_ref = self.db.collection('users').document(google_id)
            user_doc = user_ref.get()
            
            if user_doc.exists:
                return user_doc.to_dict()
            return None
            
        except Exception as e:
            logger.error(f"Error getting user {google_id}: {e}")
            return None
    
    def create_or_update_user(self, user_info: UserInfo) -> bool:
        """Create or update user in Firestore"""
        if not self.initialized:
            return False
            
        try:
            user_ref = self.db.collection('users').document(user_info.google_id)
            user_doc = user_ref.get()
            
            now = datetime.utcnow()
            
            if user_doc.exists:
                # Update existing user
                user_ref.update({
                    'email': user_info.email,
                    'name': user_info.name,
                    'picture': user_info.picture,
                    'last_login': now,
                    'updated_at': now
                })
                logger.info(f"Updated user: {user_info.email}")
            else:
                # Create new user
                user_ref.set({
                    'google_id': user_info.google_id,
                    'email': user_info.email,
                    'name': user_info.name,
                    'picture': user_info.picture,
                    'chat_count': 0,
                    'plan_type': 'free',
                    'is_premium': False,
                    'created_at': now,
                    'last_login': now,
                    'updated_at': now
                })
                logger.info(f"Created new user: {user_info.email}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error creating/updating user {user_info.google_id}: {e}")
            return False
    
    def get_user_chat_count(self, google_id: str) -> int:
        """Get user's current chat count"""
        if not self.initialized:
            return 0
            
        try:
            user_data = self.get_user(google_id)
            if user_data:
                return user_data.get('chat_count', 0)
            return 0
            
        except Exception as e:
            logger.error(f"Error getting chat count for {google_id}: {e}")
            return 0
    
    def increment_chat_count(self, google_id: str) -> int:
        """Increment user's chat count and return new count"""
        if not self.initialized:
            return 0
            
        try:
            user_ref = self.db.collection('users').document(google_id)
            
            # Use transaction to safely increment
            @firestore.transactional
            def update_chat_count(transaction):
                user_doc = user_ref.get(transaction=transaction)
                if user_doc.exists:
                    current_count = user_doc.get('chat_count') or 0
                    new_count = current_count + 1
                    transaction.update(user_ref, {
                        'chat_count': new_count,
                        'last_activity': datetime.utcnow()
                    })
                    return new_count
                return 0
            
            transaction = self.db.transaction()
            new_count = update_chat_count(transaction)
            
            logger.info(f"Incremented chat count for {google_id} to {new_count}")
            return new_count
            
        except Exception as e:
            logger.error(f"Error incrementing chat count for {google_id}: {e}")
            return 0
    
    def save_message(self, google_id: str, conversation_id: str, message_type: str, 
                    content: str, sources: List[Dict] = None) -> bool:
        """Save a message to Firestore"""
        if not self.initialized:
            logger.warning("Firebase not initialized, cannot save message")
            return False
            
        try:
            now = datetime.utcnow()
            
            # Generate unique message ID
            message_id = f"msg_{google_id}_{int(now.timestamp() * 1000)}_{message_type}"
            
            # Save message
            message_ref = self.db.collection('messages').document(message_id)
            message_data = {
                'user_id': google_id,
                'conversation_id': conversation_id,
                'type': message_type,  # 'user' or 'bot'
                'content': content,
                'sources': sources or [],
                'timestamp': now,
                'created_at': now
            }
            
            message_ref.set(message_data)
            logger.info(f"Saved message: {message_id} for conversation: {conversation_id}")
            
            # Update or create conversation
            conversation_ref = self.db.collection('conversations').document(conversation_id)
            conversation_doc = conversation_ref.get()
            
            if conversation_doc.exists:
                # Update existing conversation
                conversation_ref.update({
                    'updated_at': now,
                    'last_message': content[:100] + ('...' if len(content) > 100 else ''),
                    'message_count': firestore.Increment(1)
                })
                logger.info(f"Updated conversation: {conversation_id}")
            else:
                # Create new conversation
                conversation_data = {
                    'user_id': google_id,
                    'title': content[:50] + ('...' if len(content) > 50 else ''),
                    'created_at': now,
                    'updated_at': now,
                    'message_count': 1,
                    'last_message': content[:100] + ('...' if len(content) > 100 else '')
                }
                conversation_ref.set(conversation_data)
                logger.info(f"Created new conversation: {conversation_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error saving message: {e}")
            return False

    def get_user_conversations(self, google_id: str, limit: int = 20) -> List[Dict]:
        """Get user's conversation history"""
        if not self.initialized:
            logger.warning("Firebase not initialized, returning empty conversations")
            return []
            
        try:
            logger.info(f"Fetching conversations for user: {google_id}")
            
            conversations_ref = self.db.collection('conversations')
            query = conversations_ref.where('user_id', '==', google_id).limit(limit)
            
            conversations = []
            doc_count = 0
            
            for doc in query.stream():
                doc_count += 1
                conversation_data = doc.to_dict()
                conversation_data['id'] = doc.id
                
                # Handle timestamps more carefully
                for timestamp_field in ['created_at', 'updated_at']:
                    if timestamp_field in conversation_data and conversation_data[timestamp_field]:
                        timestamp_value = conversation_data[timestamp_field]
                        try:
                            # If it's already a string, keep it
                            if isinstance(timestamp_value, str):
                                continue
                            # If it's a Firestore timestamp, convert to ISO string
                            elif hasattr(timestamp_value, 'isoformat'):
                                conversation_data[timestamp_field] = timestamp_value.isoformat()
                            # If it's a datetime object, convert to ISO string  
                            elif hasattr(timestamp_value, 'strftime'):
                                conversation_data[timestamp_field] = timestamp_value.isoformat()
                            else:
                                # If we can't convert, just stringify it
                                conversation_data[timestamp_field] = str(timestamp_value)
                        except Exception as e:
                            logger.warning(f"Could not convert {timestamp_field}: {e}")
                            # Keep original value if conversion fails
                            pass
                
                conversations.append(conversation_data)
                logger.info(f"Processed conversation: {doc.id}")
            
            logger.info(f"Successfully processed {len(conversations)} conversations for user {google_id}")
            
            # Sort by updated_at (most recent first)
            try:
                conversations.sort(key=lambda x: x.get('updated_at', ''), reverse=True)
                logger.info("Conversations sorted successfully")
            except Exception as e:
                logger.warning(f"Could not sort conversations: {e}")
            
            return conversations
            
        except Exception as e:
            logger.error(f"Error getting conversations for {google_id}: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return []

    def get_conversation_messages(self, conversation_id: str, limit: int = 50) -> List[Dict]:
        """Get messages for a specific conversation"""
        if not self.initialized:
            logger.warning("Firebase not initialized, returning empty messages")
            return []
            
        try:
            messages_ref = self.db.collection('messages')
            query = messages_ref.where('conversation_id', '==', conversation_id)\
                            .order_by('timestamp')\
                            .limit(limit)
            
            messages = []
            for doc in query.stream():
                message_data = doc.to_dict()
                message_data['id'] = doc.id
                # Convert timestamp to ISO string
                if 'timestamp' in message_data:
                    message_data['timestamp'] = message_data['timestamp'].isoformat()
                if 'created_at' in message_data:
                    message_data['created_at'] = message_data['created_at'].isoformat()
                messages.append(message_data)
            
            logger.info(f"Retrieved {len(messages)} messages for conversation {conversation_id}")
            return messages
            
        except Exception as e:
            logger.error(f"Error getting messages for conversation {conversation_id}: {e}")
            return []
    
    def can_user_chat(self, google_id: str) -> bool:
        """Check if user can send more chats"""
        try:
            user_data = self.get_user(google_id)
            if not user_data:
                return True  # New user gets free chats
            
            if user_data.get('is_premium', False):
                return True  # Premium users have unlimited chats
            
            chat_count = user_data.get('chat_count', 0)
            return chat_count < 3  # Free users get 3 chats
            
        except Exception as e:
            logger.error(f"Error checking chat limits for {google_id}: {e}")
            return False
    
    def get_remaining_chats(self, google_id: str) -> int:
        """Get remaining free chats for user"""
        try:
            user_data = self.get_user(google_id)
            if not user_data:
                return 3  # New user gets 3 free chats
            
            if user_data.get('is_premium', False):
                return 999  # Premium users have "unlimited"
            
            chat_count = user_data.get('chat_count', 0)
            return max(0, 3 - chat_count)
            
        except Exception as e:
            logger.error(f"Error getting remaining chats for {google_id}: {e}")
            return 0
    def debug_conversations(self, google_id: str) -> Dict:
        """Debug function to see what's in the conversations collection"""
        if not self.initialized:
            return {"error": "Firebase not initialized"}
            
        try:
            conversations_ref = self.db.collection('conversations')
            
            # Get ALL conversations first
            all_conversations = []
            for doc in conversations_ref.stream():
                data = doc.to_dict()
                data['id'] = doc.id
                all_conversations.append(data)
            
            # Get conversations for this user
            user_conversations = []
            query = conversations_ref.where('user_id', '==', google_id)
            for doc in query.stream():
                data = doc.to_dict()
                data['id'] = doc.id
                user_conversations.append(data)
            
            return {
                "total_conversations": len(all_conversations),
                "user_conversations": len(user_conversations),
                "user_id_searched": google_id,
                "sample_user_ids": [conv.get('user_id') for conv in all_conversations[:5]],
                "user_conversations_data": user_conversations
            }
            
        except Exception as e:
            return {"error": str(e)}
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
        
    def get_conversation_messages(self, conversation_id: str, limit: int = 50) -> List[Dict]:
        """Get messages for a specific conversation"""
        if not self.initialized:
            logger.warning("Firebase not initialized, returning empty messages")
            return []
            
        try:
            logger.info(f"Fetching messages for conversation: {conversation_id}")
            
            messages_ref = self.db.collection('messages')
            query = messages_ref.where('conversation_id', '==', conversation_id)\
                            .order_by('timestamp')\
                            .limit(limit)
            
            messages = []
            for doc in query.stream():
                message_data = doc.to_dict()
                message_data['id'] = doc.id
                # Convert timestamp to ISO string
                if 'timestamp' in message_data and message_data['timestamp']:
                    try:
                        if hasattr(message_data['timestamp'], 'isoformat'):
                            message_data['timestamp'] = message_data['timestamp'].isoformat()
                    except:
                        pass
                if 'created_at' in message_data and message_data['created_at']:
                    try:
                        if hasattr(message_data['created_at'], 'isoformat'):
                            message_data['created_at'] = message_data['created_at'].isoformat()
                    except:
                        pass
                messages.append(message_data)
            
            logger.info(f"Retrieved {len(messages)} messages for conversation {conversation_id}")
            return messages
            
        except Exception as e:
            logger.error(f"Error getting messages for conversation {conversation_id}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return []
    
    async def delete_conversation(conversation_id: str, current_user: UserInfo):
        """Delete a conversation"""
        try:
            # Add logic to delete conversation from Firebase
            # For now, return success message
            return {
                "message": "Conversation deleted successfully",
                "conversation_id": conversation_id
            }
            
        except Exception as e:
            logger.error(f"Error deleting conversation: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error deleting conversation: {str(e)}")
    
    # Make sure this function exists in your core/firebase_service.py

    def cleanup_old_conversations(self, google_id: str, keep_count: int = 3) -> bool:
        """Delete old conversations, keeping only the most recent ones"""
        if not self.initialized:
            logger.warning("Firebase not initialized, cannot cleanup conversations")
            return False
            
        try:
            logger.info(f"Starting cleanup for user {google_id}, keeping {keep_count} conversations")
            
            # Get all conversations for this user, ordered by most recent first
            conversations_ref = self.db.collection('conversations')
            query = conversations_ref.where('user_id', '==', google_id)\
                                    .order_by('updated_at', direction=firestore.Query.DESCENDING)
            
            all_conversations = []
            for doc in query.stream():
                conv_data = doc.to_dict()
                all_conversations.append({
                    'id': doc.id,
                    'updated_at': conv_data.get('updated_at'),
                    'title': conv_data.get('title', 'Untitled')
                })
            
            logger.info(f"Found {len(all_conversations)} total conversations for user {google_id}")
            
            # If we have more than keep_count, delete the old ones
            if len(all_conversations) > keep_count:
                conversations_to_delete = all_conversations[keep_count:]
                logger.info(f"Will delete {len(conversations_to_delete)} old conversations")
                
                for conv in conversations_to_delete:
                    logger.info(f"Deleting conversation: {conv['id']} - {conv['title']}")
                    
                    # Delete associated messages first
                    messages_ref = self.db.collection('messages')
                    messages_query = messages_ref.where('conversation_id', '==', conv['id'])
                    
                    deleted_messages = 0
                    batch = self.db.batch()
                    
                    for msg_doc in messages_query.stream():
                        batch.delete(msg_doc.reference)
                        deleted_messages += 1
                    
                    # Commit message deletions
                    if deleted_messages > 0:
                        batch.commit()
                        logger.info(f"Deleted {deleted_messages} messages from conversation {conv['id']}")
                    
                    # Delete the conversation document
                    self.db.collection('conversations').document(conv['id']).delete()
                    logger.info(f"Deleted conversation document: {conv['id']}")
                
                logger.info(f"Cleanup complete. Deleted {len(conversations_to_delete)} conversations and their messages")
                return True
            else:
                logger.info(f"No cleanup needed. User has {len(all_conversations)} conversations (limit: {keep_count})")
                return False
                
        except Exception as e:
            logger.error(f"Error cleaning up conversations for {google_id}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False
    
    def is_premium_user(self, google_id: str) -> bool:
        """Check if user has premium subscription"""
        if not self.initialized:
            return False
            
        try:
            user_data = self.get_user(google_id)
            if user_data:
                return user_data.get('is_premium', False)
            return False
        except Exception as e:
            logger.error(f"Error checking premium status: {e}")
            return False


    def upgrade_to_premium(self, google_id: str, payment_details: dict = None) -> bool:
        """Upgrade user to premium (unlimited chats)"""
        if not self.initialized:
            logger.error("Firebase not initialized")
            return False
            
        try:
            user_ref = self.db.collection('users').document(google_id)
            user_doc = user_ref.get()
            
            if not user_doc.exists:
                logger.error(f"User {google_id} not found")
                return False
            
            from datetime import datetime
            
            # Update user to premium
            update_data = {
                'is_premium': True,
                'plan_type': 'premium',
                'upgraded_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            
            # Store payment details
            if payment_details:
                update_data['payment_details'] = payment_details
            
            user_ref.update(update_data)
            
            logger.info(f"✅ Upgraded user {google_id} to premium")
            return True
            
        except Exception as e:
            logger.error(f"Error upgrading user {google_id} to premium: {e}")
            return False


    def get_remaining_chats(self, google_id: str) -> int:
        """
        Get remaining chats for user
        Returns -1 for premium users (unlimited)
        """
        try:
            user_data = self.get_user(google_id)
            if not user_data:
                return 3  # New user gets 3 free chats
            
            # ✅ Check if premium - return -1 for unlimited
            if user_data.get('is_premium', False):
                return -1  # -1 means unlimited
            
            # Free user - calculate remaining
            chat_count = user_data.get('chat_count', 0)
            return max(0, 3 - chat_count)
            
        except Exception as e:
            logger.error(f"Error getting remaining chats for {google_id}: {e}")
            return 0
        
    def log_payment_failure(self, user_id: str, failure_record: dict) -> bool:
        """Log payment failure for analytics"""
        try:
            if not self.initialized:
                return False
            
            self.db.collection('payment_failures').add({
                'user_id': user_id,
                **failure_record,
                'created_at': firestore.SERVER_TIMESTAMP
            })
            
            logger.info(f"✅ Payment failure logged for user: {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error logging payment failure: {e}")
            return False
# Global Firebase service instance
firebase_service = FirebaseService()