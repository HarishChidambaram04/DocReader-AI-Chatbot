import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/layout/Header';
import BackgroundElements from './components/layout/BackgroundElements';
import MessageList from './components/chat/MessageList';
import InputArea from './components/layout/InputArea';
import SidePanel from './components/layout/SidePanel';
import ChatHistory from './components/chat/ChatHistory';
import AuthInterface from './components/auth/AuthInterface';
import UpgradePrompt from './components/auth/UpgradePrompt';
import { useMessages } from './hooks/useMessages';
import { useChatApi } from './hooks/useChatApi';
import { useConnectionStatus } from './hooks/useConnectionStatus';
import { useAuth } from './hooks/useAuth';
import { useConversations } from './hooks/useConversations';
import Payment from './components/Payment';

const RAGChatbot = () => {
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const {
    user,
    isAuthenticated,
    isLoading: authLoading,
    chatLimits,
    setChatLimits,
    logout,
    getAuthHeaders,
    updateChatLimits
  } = useAuth();

  const {
    conversations,
    currentConversation,
    conversationMessages,
    startNewConversation,
    switchToConversation,
    addMessageToConversation,
    deleteConversation,
    isLoading: conversationsLoading,
    fetchConversations,
    fetchConversationMessages
  } = useConversations(getAuthHeaders, isAuthenticated);

  const {
    messages,
    addMessage,
    clearMessages,
    isLoading,
    setIsLoading
  } = useMessages(currentConversation, conversationMessages);

  // ✅ Callback to update chat limits from backend response
  const handleChatLimitUpdate = useCallback((newRemaining, newUsed) => {
    console.log('Chat limit update received in App.jsx:', { 
      remaining: newRemaining, 
      used: newUsed 
    });
    
    setChatLimits({
      remaining: newRemaining,
      used: newUsed,
      canChat: newRemaining > 0 || newRemaining === -1  // ✅ -1 = unlimited (premium)
    });
  }, [setChatLimits]);

  const {
    sendMessage,
    apiEndpoint,
    setApiEndpoint
  } = useChatApi(
    addMessage, 
    setIsLoading, 
    getAuthHeaders(),
    addMessageToConversation,
    handleChatLimitUpdate
  );

  const {
    connectionStatus,
    lastError,
    testConnection
  } = useConnectionStatus(apiEndpoint);

  // ✅ Open upgrade modal
  const handleOpenUpgradeModal = () => {
    console.log('Opening upgrade modal...');
    setShowUpgradeModal(true);
  };

  // ✅ Handle successful upgrade - refresh user data
  const handleUpgradeSuccess = async () => {
    console.log('🎉 Upgrade successful! Refreshing user data...');
    
    try {
      // Fetch updated user data from backend
      const response = await fetch('http://localhost:8000/auth/me', {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('Updated user data:', userData);
        
        // ✅ Set unlimited chats (-1)
        setChatLimits({
          remaining: -1,  // -1 = unlimited for premium users
          used: userData.chat_count || 0,
          canChat: true
        });
        
        alert('🎉 Welcome to Premium!\n\nYou now have unlimited chats!');
      } else {
        console.error('Failed to fetch updated user data');
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
    
    // Close the modal
    setShowUpgradeModal(false);
  };

  const handleCloseUpgradeModal = () => {
    console.log('Closing upgrade modal');
    setShowUpgradeModal(false);
  };

  // ✅ Backup: Old Payment.jsx flow (if you want to keep it)
  const handleUpgrade = () => {
    setShowUpgradeModal(false);
    setShowPayment(true);
  };

  const handlePaymentSuccess = async () => {
    setShowPayment(false);
    await handleUpgradeSuccess();  // Reuse the upgrade success handler
  };

  const handlePaymentBack = () => setShowPayment(false);

  // Show old payment page if needed
  if (showPayment) {
    return (
      <Payment onBack={handlePaymentBack} onSuccess={handlePaymentSuccess} />
    );
  }

  const handleSendMessage = async (messageContent) => {
    if (!isAuthenticated) {
      addMessage({
        id: Date.now(),
        type: 'bot',
        content: 'Please log in with Google to start chatting.',
        timestamp: new Date(),
        isError: true
      });
      return;
    }

    // ✅ Check chat limits (allow if premium: remaining === -1)
    if (chatLimits && !chatLimits.canChat && chatLimits.remaining !== -1) {
      handleOpenUpgradeModal();
      return;
    }

    let conversationId = currentConversation?.id || startNewConversation();

    try {
      const userMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'user',
        content: messageContent,
        timestamp: new Date()
      };
      
      addMessage(userMessage);
      addMessageToConversation(conversationId, {
        type: 'user',
        content: messageContent,
        timestamp: new Date().toISOString()
      });
      
      await sendMessage(messageContent, conversationId);
      
    } catch (error) {
      console.error('Message send error:', error);
    }
  };

  const handleSelectConversation = async (conversation) => {
    try {
      switchToConversation(conversation);
      await fetchConversationMessages(conversation.id);
    } catch (error) {
      console.error('Error selecting conversation:', error);
    }
  };

  const handleNewConversation = () => {
    startNewConversation();
    clearMessages();
  };

  const handleDeleteConversation = async (conversationId) => {
    await deleteConversation(conversationId);
    if (currentConversation?.id === conversationId) clearMessages();
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 relative overflow-hidden">
        <BackgroundElements />
        <div className="flex flex-col flex-1">
          <Header
            isAuthenticated={isAuthenticated}
            user={user}
            onLogout={logout}
            sidePanelOpen={sidePanelOpen}
            setSidePanelOpen={setSidePanelOpen}
            onOpenUpgradeModal={handleOpenUpgradeModal}
            chatLimits={chatLimits}
          />
          <div className="flex-1 flex items-center justify-center">
            <AuthInterface
              user={user}
              isAuthenticated={isAuthenticated}
              isLoading={authLoading}
              chatLimits={chatLimits}
              onLogout={logout}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 relative overflow-hidden">
      <BackgroundElements />

      {showChatHistory && (
        <ChatHistory
          conversations={conversations}
          currentConversation={currentConversation}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          isLoading={conversationsLoading}
        />
      )}

      <SidePanel 
        isOpen={sidePanelOpen} 
        setIsOpen={setSidePanelOpen}
        conversations={conversations}
        currentConversation={currentConversation}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        isLoading={conversationsLoading}
        getAuthHeaders={getAuthHeaders}
        // NEW: Pass premium info to SidePanel
        user={user}
        chatLimits={chatLimits}
        onOpenUpgradeModal={handleOpenUpgradeModal}
      />


      <div
        className={`flex flex-col flex-1 transition-all duration-300 ${
          sidePanelOpen ? 'lg:ml-80 ml-0' : ''
        } ${showChatHistory ? 'ml-80' : ''}`}
      >
        <Header
          isAuthenticated={isAuthenticated}
          user={user}
          onLogout={logout}
          sidePanelOpen={sidePanelOpen}
          setSidePanelOpen={setSidePanelOpen}
          onOpenUpgradeModal={handleOpenUpgradeModal}
          chatLimits={chatLimits}
        />

        <MessageList messages={messages} isLoading={isLoading} user={user} />

        <InputArea
          onSendMessage={handleSendMessage}
          connectionStatus={connectionStatus}
          isLoading={isLoading}
          isAuthenticated={isAuthenticated}
          chatLimits={chatLimits}
          onOpenUpgradeModal={handleOpenUpgradeModal}
        />
      </div>

      {/* ✅ Razorpay upgrade modal with backend integration */}
      {showUpgradeModal && (
        <UpgradePrompt 
          onClose={handleCloseUpgradeModal}
          user={user}  // ✅ Pass user object
          getAuthHeaders={getAuthHeaders}  // ✅ Pass auth headers
          onUpgradeSuccess={handleUpgradeSuccess}  // ✅ Pass success callback
        />
      )}
    </div>
  );
};

export default RAGChatbot;
