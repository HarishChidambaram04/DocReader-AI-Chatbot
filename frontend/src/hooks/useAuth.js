// hooks/useAuth.js
import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS, GOOGLE_CONFIG, LIMITS } from '../utils/constants';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('auth_token'));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [chatLimits, setChatLimits] = useState({
    remaining: LIMITS.FREE_CHAT_LIMIT,
    used: 0,
    canChat: true
  });

  // Initialize Google OAuth
  const initializeGoogleAuth = useCallback(() => {
    if (window.google && window.google.accounts) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CONFIG.CLIENT_ID,
        callback: handleGoogleLogin
      });
    }
  }, []);

  // Handle Google login response
  const handleGoogleLogin = async (response) => {
    setIsLoading(true);
    try {
      console.log('Google login response received');
      
      const loginResponse = await fetch(API_ENDPOINTS.GOOGLE_LOGIN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: response.credential
        }),
      });

      if (!loginResponse.ok) {
        throw new Error(`Login failed: ${loginResponse.statusText}`);
      }

      const data = await loginResponse.json();
      
      const chatCount = data.user?.chat_count || data.chat_count || 0;
      
      // Store token and user info
      setToken(data.access_token);
      setUser(data.user);
      setIsAuthenticated(true);
      
      // ✅ FIX 1: Handle -1 for unlimited (premium users)
      setChatLimits({
        remaining: data.remaining_chats,
        used: chatCount,
        canChat: data.remaining_chats > 0 || data.remaining_chats === -1  // ✅ FIXED!
      });

      // Store in localStorage
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('user_info', JSON.stringify(data.user));

      console.log('Login successful:', data.user.email);
      console.log('Chat limits:', { 
        remaining: data.remaining_chats, 
        used: chatCount,
        canChat: data.remaining_chats > 0 || data.remaining_chats === -1
      });
      
    } catch (error) {
      console.error('Login error:', error);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setChatLimits({
      remaining: LIMITS.FREE_CHAT_LIMIT,
      used: 0,
      canChat: true
    });
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    console.log('User logged out');
  }, []);

  // Get user status from server
  const fetchUserStatus = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(API_ENDPOINTS.USER_ME, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        console.log('📊 Fetched user status:', data);  // ✅ Debug log
        
        // ✅ Update user data
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('user_info', JSON.stringify(data.user));
        }
        
        // ✅ Update chat limits with premium support
        const remaining = data.remaining_chats ?? data.remaining ?? -1;
        const used = data.chat_count ?? data.used ?? 0;
        
        console.log('💎 Setting chat limits:', { remaining, used, isPremium: remaining === -1 });
        
        setChatLimits({
          remaining: remaining,
          used: used,
          canChat: remaining > 0 || remaining === -1
        });
      } else if (response.status === 401) {
        logout();
      }
    } catch (error) {
      console.error('Error fetching user status:', error);
    }
  }, [token, logout]);


  // Check if user can chat
  const checkChatLimits = useCallback(async () => {
    if (!token) return false;

    try {
      const response = await fetch(API_ENDPOINTS.CHAT_LIMITS, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // ✅ FIX 3: Handle -1 for unlimited
        setChatLimits({
          remaining: data.remaining_chats,
          used: LIMITS.FREE_CHAT_LIMIT - data.remaining_chats,
          canChat: data.remaining_chats > 0 || data.remaining_chats === -1  // ✅ FIXED!
        });
        
        return data.remaining_chats > 0 || data.remaining_chats === -1;
      }
      return false;
    } catch (error) {
      console.error('Error checking chat limits:', error);
      return false;
    }
  }, [token]);

  // Get authorization headers for API calls
  const getAuthHeaders = useCallback(() => {
    if (!token) return {};
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }, [token]);

  // Initialize authentication on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user_info');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
        // Fetch current status from server
        fetchUserStatus();
      } catch (error) {
        console.error('Error loading stored auth data:', error);
        logout();
      }
    }

    // Load Google OAuth script
    if (!window.google) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleAuth;
      document.head.appendChild(script);
    } else {
      initializeGoogleAuth();
    }
  }, []);

  // ✅ FIX 4: Update chat limits with unlimited support
  const updateChatLimits = useCallback((newRemaining, newUsed) => {
    setChatLimits({
      remaining: newRemaining,
      used: newUsed,
      canChat: newRemaining > 0 || newRemaining === -1  // ✅ FIXED!
    });
  }, []);

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    chatLimits,
    setChatLimits,
    logout,
    fetchUserStatus,
    checkChatLimits,
    updateChatLimits,
    getAuthHeaders,
    initializeGoogleAuth
  };
};
