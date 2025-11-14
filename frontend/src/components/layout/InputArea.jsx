import React, { useState, useRef } from 'react';
import { Send, Loader2, AlertCircle, Lock, Crown } from 'lucide-react';

const InputArea = ({
  onSendMessage,
  connectionStatus,
  isLoading,
  isAuthenticated,
  chatLimits,
  onOpenUpgradeModal
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const inputRef = useRef(null);

  const canSend = () =>
    inputMessage.trim() &&
    !isLoading &&
    connectionStatus === 'connected' &&
    isAuthenticated &&
    chatLimits.canChat;

  const getPlaceholderText = () => {
    if (!isAuthenticated) return "Please log in with Google to start chatting...";
    else if (!chatLimits.canChat) return "You've used all free chats. Upgrade to continue...";
    else if (connectionStatus !== 'connected') return "Please check server connection...";
    else return "Ask me anything about your documents...";
  };

  const handleSendMessage = () => {
    if (!canSend()) return;
    onSendMessage(inputMessage);
    setInputMessage('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getStatusWarning = () => {
    if (!isAuthenticated) {
      return (
        <span className="text-yellow-700 flex items-center">
          <Lock className="w-3 h-3 mr-1" />
          Login required
        </span>
      );
    } else if (!chatLimits.canChat) {
      return (
        <button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🎯 Status warning clicked - opening upgrade modal');
            if (onOpenUpgradeModal) {
              onOpenUpgradeModal();
            }
          }}
          className="text-blue-700 flex items-center hover:text-blue-800 hover:underline cursor-pointer transition-all"
          type="button"
        >
          <Crown className="w-3 h-3 mr-1" />
          <span>Upgrade needed</span>
        </button>
      );
    } else if (connectionStatus !== 'connected') {
      return (
        <span className="text-red-600 flex items-center">
          <AlertCircle className="w-3 h-3 mr-1" />
          Server disconnected
        </span>
      );
    }
    return null;
  };

  const getChatLimitInfo = () => {
  if (!isAuthenticated) return null;
  
  const remaining = chatLimits.remaining;
  
  // ✅ Premium user (unlimited chats)
  if (remaining === -1) {
    return (
      <span className="text-green-600 text-sm flex items-center gap-1">
        <Crown className="w-4 h-4 text-yellow-500" />
        <span className="font-semibold">Unlimited chats</span>
      </span>
    );
  }
  
  // ✅ Free user with remaining chats
  if (!chatLimits.canChat) return null;
  
  let textColor = 'text-green-600';
  if (remaining <= 1) textColor = 'text-red-600';
  else if (remaining <= 2) textColor = 'text-yellow-600';
  
  return (
    <span className={`${textColor} text-sm`}>
      {remaining} chat{remaining !== 1 ? 's' : ''} remaining
    </span>
  );
};

  return (
    <div className="relative z-10 bg-transparent">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative group">
            <label
              htmlFor="chatInput"
              className={`absolute left-5 top-2 text-sm transition-all duration-200 ${
                inputMessage
                  ? 'text-gray-800 -translate-y-3 scale-90 bg-white px-1'
                  : 'text-gray-600 translate-y-2 scale-100'
              }`}
            >
              {getPlaceholderText()}
            </label>

            <textarea
              id="chatInput"
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              rows={1}
              disabled={
                !isAuthenticated ||
                !chatLimits.canChat ||
                connectionStatus !== 'connected'
              }
              className={`w-full px-5 py-3 rounded-2xl backdrop-blur-md bg-white/90 border border-blue-100 
                         focus:outline-none focus:ring-4 focus:ring-blue-200 text-black font-medium placeholder-transparent
                         shadow-sm transition-all duration-200 resize-none ${
                (!isAuthenticated || !chatLimits.canChat || connectionStatus !== 'connected')
                  ? 'opacity-60 cursor-not-allowed'
                  : 'focus:shadow-lg'
              }`}
              style={{
                minHeight: '44px',
                maxHeight: '100px',
                color: '#000',
                fontWeight: 500,
              }}
            />
          </div>

          {/* ✅ FIXED: Smart Send/Upgrade Button */}
          <button
            onClick={() => {
              console.log('Button clicked! chatLimits.canChat:', chatLimits.canChat);
              
              // ✅ If no chats remaining, open upgrade modal
              if (!chatLimits.canChat && isAuthenticated) {
                console.log('🎯 Opening upgrade modal from Send button');
                if (onOpenUpgradeModal) {
                  onOpenUpgradeModal();
                } else {
                  console.error('onOpenUpgradeModal is not defined!');
                }
              } else {
                // Normal send message behavior
                handleSendMessage();
              }
            }}
            disabled={isLoading || !isAuthenticated || connectionStatus !== 'connected'}
            className="p-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl 
                      hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed 
                      transition-all duration-200 flex-shrink-0 shadow-md transform hover:scale-105 active:scale-95"
            title={
              !isAuthenticated
                ? 'Login required'
                : !chatLimits.canChat
                ? 'Click to upgrade to premium'
                : connectionStatus !== 'connected'
                ? 'Server disconnected'
                : 'Send message'
            }
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : !isAuthenticated ? (
              <Lock className="w-6 h-6" />
            ) : !chatLimits.canChat ? (
              <Crown className="w-6 h-6" />
            ) : (
              <Send className="w-6 h-6" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between mt-3 text-gray-800 text-sm">
          <p>Press Enter to send, Shift+Enter for new line</p>
          <div className="flex items-center space-x-4">
            {getChatLimitInfo()}
            <span>{inputMessage.length}/1000</span>
            {getStatusWarning()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputArea;
