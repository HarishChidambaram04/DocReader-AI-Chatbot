// components/auth/UpgradePrompt.jsx
import React, { useEffect } from "react";
import { Crown, MessageCircle, Zap, X } from "lucide-react";

const UpgradePrompt = ({ onClose, user, getAuthHeaders, onUpgradeSuccess }) => {
  
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleUpgrade = async () => {
    if (!user || !user.google_id) {
      alert('Please login first to upgrade');
      return;
    }

    try {
      console.log('Creating order for user:', user.google_id);
      
      // Step 1: Create order
      const orderResponse = await fetch('http://localhost:8000/api/payment/create-order', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 49900, // ₹499 in paise
          currency: 'INR'
        })
      });

      if (!orderResponse.ok) {
        throw new Error('Failed to create order');
      }

      const orderData = await orderResponse.json();
      console.log('Order created:', orderData);

      // Step 2: Open Razorpay
      const options = {
        key: "rzp_test_RYYc3rSYNvwjRx",
        amount: orderData.amount,
        currency: orderData.currency,
        name: "DocReaderAI Premium",
        description: "Upgrade to Unlimited Chats",
        order_id: orderData.order_id,
        
        // Step 3: Handle payment success
        handler: async function (response) {
          console.log('Payment successful:', response);
          
          try {
            // Step 4: Verify payment
            const verifyResponse = await fetch('http://localhost:8000/api/payment/verify-payment', {
              method: 'POST',
              headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                user_id: user.google_id,
                amount: 49900,
                currency: 'INR'
              })
            });

            const verifyData = await verifyResponse.json();

            if (verifyData.status === 'success') {
              alert('🎉 Payment Successful! You now have unlimited chats!');
              if (onUpgradeSuccess) {
                await onUpgradeSuccess();
              }
              onClose();
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (error) {
            console.error('Verification error:', error);
            alert('Payment received but verification failed. Contact support with Payment ID: ' + response.razorpay_payment_id);
          }
        },
        
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
        },
        
        theme: {
          color: "#1E88E5",
        },
      };

      const rzp = new window.Razorpay(options);
      
      rzp.on('payment.failed', function (response) {
        console.error('Payment failed:', response.error);
        alert('Payment Failed: ' + response.error.description);
      });
      
      rzp.open();
      
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to initiate payment: ' + error.message);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-gradient-to-br from-[#E3F2FD]/90 via-[#BBDEFB]/90 to-[#90CAF9]/90 backdrop-blur-xl rounded-2xl p-8 border border-white/20 shadow-2xl text-center relative animate-fade-in">
          <button onClick={onClose} className="absolute top-4 right-4 text-black/70 hover:text-black transition-colors">
            <X className="w-6 h-6" />
          </button>

          <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-[#64B5F6] to-[#42A5F5] rounded-full flex items-center justify-center shadow-md">
            <Crown className="w-8 h-8 text-white" />
          </div>

          <h3 className="text-2xl font-bold text-black mb-2">Upgrade to Premium</h3>
          <p className="text-black/70 mb-6">You've used all 3 free chats. Unlock unlimited conversations!</p>

          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="bg-white/80 rounded-lg p-4 border border-black/10 shadow-sm">
              <div className="flex items-center justify-center mb-2">
                <MessageCircle className="w-5 h-5 text-[#0288D1] mr-2" />
                <span className="text-black font-medium">Free Plan</span>
              </div>
              <div className="text-2xl font-bold text-black mb-1">3</div>
              <div className="text-black/60 text-sm">Chats per session</div>
            </div>

            <div className="bg-gradient-to-br from-[#90CAF9]/50 to-[#64B5F6]/50 rounded-lg p-4 border border-[#64B5F6]/70 shadow-md">
              <div className="flex items-center justify-center mb-2">
                <Crown className="w-5 h-5 text-yellow-500 mr-2" />
                <span className="text-black font-semibold">Premium</span>
              </div>
              <div className="flex items-center justify-center mb-1">
                <span className="text-3xl font-bold text-black">∞</span>
              </div>
              <div className="text-black/70 text-sm">Unlimited Chats</div>
            </div>
          </div>

          <div className="space-y-3 mb-8 text-black">
            <div className="flex items-center justify-center">
              <Zap className="w-4 h-4 text-yellow-500 mr-2" />
              <span className="text-sm">Faster response times</span>
            </div>
            <div className="flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-[#0288D1] mr-2" />
              <span className="text-sm">Priority support</span>
            </div>
            <div className="flex items-center justify-center">
              <Crown className="w-4 h-4 text-[#007AFF] mr-2" />
              <span className="text-sm">Advanced AI features</span>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-3xl font-bold text-black">₹499</div>
            <div className="text-black/60 text-sm">One-time payment • Lifetime access</div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleUpgrade}
              className="w-full px-8 py-4 bg-gradient-to-r from-[#64B5F6] to-[#1E88E5] text-white font-semibold rounded-xl hover:from-[#42A5F5] hover:to-[#1976D2] transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              Upgrade to Premium - ₹499
            </button>

            <button
              onClick={onClose}
              className="w-full px-8 py-3 bg-white/70 text-black font-medium rounded-xl hover:bg-white/90 transition-colors"
            >
              Maybe Later
            </button>
          </div>

          <div className="mt-6 flex items-center justify-center text-black/50 text-xs">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Secure payment powered by Razorpay
          </div>
        </div>
      </div>
    </>
  );
};

export default UpgradePrompt;
