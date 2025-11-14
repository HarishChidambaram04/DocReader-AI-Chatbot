# api/payment.py
import razorpay
import hmac
import hashlib
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from datetime import datetime
from app.config.settings import settings
from app.core.firebase_service import firebase_service
from app.core.auth import get_current_user
from app.models.schemas import UserInfo
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

razorpay_client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)

class OrderRequest(BaseModel):
    amount: int  # in paise
    currency: str = "INR"


@router.post("/create-order")
async def create_order(
    order: OrderRequest,
    current_user: UserInfo = Depends(get_current_user)
):
    """Create Razorpay order"""
    try:
        logger.info(f"📦 Creating order for user: {current_user.email}, amount: {order.amount}")

        razorpay_order = razorpay_client.order.create({
            "amount": order.amount,
            "currency": order.currency,
            "payment_capture": 1
        })

        logger.info(f"✅ Razorpay order created: {razorpay_order['id']}")
        
        return {
            "order_id": razorpay_order["id"],
            "amount": razorpay_order["amount"],
            "currency": razorpay_order["currency"],
        }

    except Exception as e:
        logger.error(f"❌ Razorpay error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify-payment")
async def verify_payment(request: Request):
    """Verify payment and upgrade user to premium"""
    try:
        body = await request.json()
        
        order_id = body.get("razorpay_order_id")
        payment_id = body.get("razorpay_payment_id")
        signature = body.get("razorpay_signature")
        user_id = body.get("user_id")  # ✅ Get user_id from frontend
        
        logger.info(f"💳 Verifying payment for user: {user_id}, payment_id: {payment_id}")

        if not all([order_id, payment_id, signature, user_id]):
            raise HTTPException(status_code=400, detail="Missing required fields")

        # ✅ Verify signature
        generated_signature = hmac.new(
            bytes(settings.RAZORPAY_KEY_SECRET, "utf-8"),
            bytes(order_id + "|" + payment_id, "utf-8"),
            hashlib.sha256
        ).hexdigest()

        if generated_signature != signature:
            logger.error("❌ Invalid payment signature")
            raise HTTPException(status_code=400, detail="Invalid signature")

        logger.info("✅ Payment signature verified")

        # ✅ Upgrade user to premium
        payment_details = {
            'order_id': order_id,
            'payment_id': payment_id,
            'amount': body.get('amount', 0),
            'currency': body.get('currency', 'INR'),
            'payment_date': datetime.utcnow().isoformat()
        }
        
        success = firebase_service.upgrade_to_premium(user_id, payment_details)
        
        if not success:
            logger.error(f"❌ Failed to upgrade user {user_id}")
            raise HTTPException(status_code=500, detail="Failed to upgrade user")
        
        logger.info(f"🎉 User {user_id} upgraded to premium!")
        
        return {
            "status": "success",
            "message": "Payment verified and premium activated!",
            "is_premium": True,
            "unlimited_chats": True
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Payment verification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
