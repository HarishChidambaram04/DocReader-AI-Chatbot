# config/settings.py
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # API
    TITLE = "RAG Chatbot API"
    VERSION = "1.0.0"
    HOST = "0.0.0.0"
    PORT = 8000

    # Vector DB
    DB_PATH = "./chroma_db"

    # Keys
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")

    # Models
    EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"
    LLM_MODEL = "llama-3.1-8b-instant"
    LLM_TEMPERATURE = 0

    # Retrieval
    RETRIEVAL_K = 6  # used as final top-k in the engine
    FETCH_K_MULTIPLIER = 10
    MIN_FETCH_K = 60  # documents candidate floor to mirror engine behavior
    LAMBDA_MULT = 0.2  # MMR diversity weight used by the engine

    # Reranker
    RERANKER_MODEL = "BAAI/bge-reranker-base"
    # Engine uses top_n = max(6, RETRIEVAL_K); with RETRIEVAL_K=5, this is 6
    RERANKER_TOP_N = 6

    # Prompt/context limits (match engine truncation logic)
    MAX_CONTEXT_TOKENS = 2500          # initial truncate_documents cap
    PROMPT_TOKEN_HARD_LIMIT = 5200      # safeguard before re-truncation
    FALLBACK_CONTEXT_TOKENS = 2000      # second-stage truncation size

    # Chat limits
    FREE_CHAT_LIMIT = 3

    # OAuth / JWT / CORS
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-super-secret-jwt-key-change-in-production")
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRATION_HOURS = 24
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Firebase
    FIREBASE_CREDENTIALS_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "./firebase-credentials.json")

    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
    RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", None)
    
    #File Download path
    GDRIVE_ROOT_PATH = os.getenv(
        "GDRIVE_ROOT_PATH",
        "/content/drive/MyDrive/Data Collection/Preprocessed/New Data"
    )
    
    # Library settings
    LIBRARY_ENABLED = True
    FREE_USER_DOWNLOADS_PER_DAY = 999  # Unlimited for testing
    PREMIUM_USER_DOWNLOADS_PER_DAY = 999  # Unlimited
settings = Settings()
