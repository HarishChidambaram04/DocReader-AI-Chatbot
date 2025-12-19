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

class PaymentFailure(BaseModel):
    order_id: str
    payment_id: str | None = None
    error_code: str
    error_description: str
    error_source: str | None = None
    error_step: str | None = None
    error_reason: str | None = None
    user_id: str


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
async def verify_payment(
    request: Request,
    current_user: UserInfo = Depends(get_current_user)  # ✅ ADDED AUTHENTICATION
):
    """Verify payment and upgrade user to premium"""
    try:
        body = await request.json()
        
        order_id = body.get("razorpay_order_id")
        payment_id = body.get("razorpay_payment_id")
        signature = body.get("razorpay_signature")
        
        # ✅ Use authenticated user's ID (not from request body)
        user_id = current_user.google_id
        
        logger.info(f"💳 Verifying payment for user: {user_id}, payment_id: {payment_id}")

        if not all([order_id, payment_id, signature]):
            raise HTTPException(status_code=400, detail="Missing required fields")

        # ✅ Check for duplicate payment
        existing_payment = firebase_service.get_payment_by_id(payment_id)
        if existing_payment:
            logger.warning(f"⚠️ Duplicate payment attempt: {payment_id}")
            return {
                "status": "already_processed",
                "message": "Payment already verified and premium activated",
                "is_premium": True,
                "unlimited_chats": True
            }

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


@router.post("/payment-failed")
async def payment_failed(failure: PaymentFailure):
    """Handle payment failures and log them"""
    try:
        logger.warning(f"❌ Payment failed for user: {failure.user_id}")
        logger.warning(f"   Order ID: {failure.order_id}")
        logger.warning(f"   Error: {failure.error_code} - {failure.error_description}")
        logger.warning(f"   Source: {failure.error_source}, Step: {failure.error_step}")
        logger.warning(f"   Reason: {failure.error_reason}")
        
        failure_record = {
            'user_id': failure.user_id,
            'order_id': failure.order_id,
            'payment_id': failure.payment_id,
            'error_code': failure.error_code,
            'error_description': failure.error_description,
            'error_source': failure.error_source,
            'error_step': failure.error_step,
            'error_reason': failure.error_reason,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'failed'
        }
        
        firebase_service.log_payment_failure(failure.user_id, failure_record)
        
        return {
            "status": "failure_logged",
            "message": "Payment failure has been recorded",
            "user_message": get_user_friendly_message(failure.error_code)
        }
        
    except Exception as e:
        logger.error(f"❌ Error logging payment failure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_user_friendly_message(error_code: str) -> str:
    """Convert Razorpay error codes to user-friendly messages"""
    error_messages = {
        'BAD_REQUEST_ERROR': 'Payment request failed. Please try again.',
        'GATEWAY_ERROR': 'Payment gateway error. Please try again in a few minutes.',
        'SERVER_ERROR': 'Server error occurred. Please try again later.',
        'incorrect_otp': 'Incorrect OTP entered. Please retry with the correct OTP.',
        'incorrect_pin': 'Incorrect PIN entered. Please retry with the correct PIN.',
        'payment_timeout': 'Payment timed out. Please try again.',
        'payment_cancelled': 'Payment was cancelled. You can retry anytime.',
        'insufficient_funds': 'Insufficient funds in your account.',
        'transaction_declined': 'Transaction was declined by your bank.',
        'authentication_failed': 'Payment authentication failed. Please try again.',
        'invalid_card_number': 'Invalid card number. Please check and retry.',
        'card_expired': 'Your card has expired. Please use another card.',
        'network_error': 'Network error occurred. Please check your connection and retry.',
    }
    
    return error_messages.get(error_code, 'Payment failed. Please try again or contact support.')


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """Handle Razorpay webhook notifications"""
    try:
        webhook_secret = getattr(settings, 'RAZORPAY_WEBHOOK_SECRET', None)
        
        if webhook_secret:
            signature = request.headers.get('X-Razorpay-Signature')
            body = await request.body()
            
            expected_signature = hmac.new(
                bytes(webhook_secret, 'utf-8'),
                body,
                hashlib.sha256
            ).hexdigest()
            
            if signature != expected_signature:
                logger.error("❌ Invalid webhook signature")
                raise HTTPException(status_code=400, detail="Invalid signature")
        
        payload = await request.json()
        event = payload.get('event')
        
        logger.info(f"🔔 Webhook received: {event}")
        
        if event == 'payment.failed':
            payment_entity = payload.get('payload', {}).get('payment', {}).get('entity', {})
            order_id = payment_entity.get('order_id')
            payment_id = payment_entity.get('id')
            error = payment_entity.get('error_code')
            description = payment_entity.get('error_description')
            
            logger.warning(f"❌ Webhook: Payment failed - Order: {order_id}, Error: {error}")
            
            firebase_service.log_payment_failure('webhook', {
                'order_id': order_id,
                'payment_id': payment_id,
                'error_code': error,
                'error_description': description,
                'timestamp': datetime.utcnow().isoformat()
            })
            
        elif event == 'payment.captured':
            logger.info(f"✅ Webhook: Payment captured")
            
        return {"status": "webhook_processed"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Webhook processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
