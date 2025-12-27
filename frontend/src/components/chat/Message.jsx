// components/chat/Message.jsx
import React from 'react';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MessageSources from './MessageSources';
import { formatTimestamp } from '../../utils/helpers';

const Message = ({ message }) => {
  // Custom components for ReactMarkdown
  const components = {
    strong: ({ node, ...props }) => {
      const parent = node?.position?.start?.line;
      const isFirstElement = parent === 1 || node?.position?.start?.column === 1;
      
      return (
        <>
          {!isFirstElement && <br />}
          <strong {...props} />
        </>
      );
    },
  };

  return (
    <div
      className={`flex items-start gap-2 md:gap-4 ${
        message.type === 'user' ? 'flex-row-reverse' : ''
      }`}
    >
      {/* ✅ Responsive Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shadow-lg ${
        message.type === 'user'
          ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
          : message.isError
          ? 'bg-gradient-to-r from-red-500 to-pink-500'
          : 'bg-gradient-to-r from-blue-500 to-cyan-500' 
      }`}>
        {message.type === 'user' ? (
          <User className="w-4 h-4 md:w-5 md:h-5 text-white" />
        ) : (
          <Bot className="w-4 h-4 md:w-5 md:h-5 text-white" />
        )}
      </div>
      
      {/* ✅ Responsive Message Container */}
      <div className={`flex-1 min-w-0 ${
        message.type === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start'
      }`}>
        
        {/* ✅ Message Bubble with Responsive Max-Width */}
        <div className={`inline-block p-3 md:p-4 rounded-2xl shadow-xl backdrop-blur-sm border
                         max-w-[85%] sm:max-w-[75%] md:max-w-[85%] lg:max-w-2xl break-words ${
          message.type === 'user'
            ? 'bg-gradient-to-r from-blue-500/90 to-cyan-500/90 text-white border-blue-400/30'
            : message.isError
            ? 'bg-red-500/10 text-red-700 border-red-400/30'
            : 'bg-white/40 text-black border-white/20'
        }`}>
          {message.type === 'bot' ? (
            <div className="prose prose-sm md:prose-base max-w-none">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={components}
                className="text-sm md:text-base"
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">
              {message.content}
            </p>
          )}
          
          {/* Sources - uncomment if needed */}
          {/* <MessageSources sources={message.sources} /> */}
        </div>
        
        {/* ✅ Responsive Timestamp */}
        <div className={`text-[10px] md:text-xs text-gray-700 mt-1 md:mt-2 px-1 ${
          message.type === 'user' ? 'text-right' : 'text-left'
        }`}>
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
};

export default Message;
