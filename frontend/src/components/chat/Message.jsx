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
      // Check if this strong element is the first child of its parent
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
      className={`flex items-start space-x-4 ${
        message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''
      }`}
    >
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
        message.type === 'user'
          ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
          : message.isError
          ? 'bg-gradient-to-r from-red-500 to-pink-500'
          : 'bg-gradient-to-r from-blue-500 to-cyan-500' 
      }`}>
        {message.type === 'user' ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>
      
      <div className={`flex-1 max-w-3xl ${
        message.type === 'user' ? 'text-right' : 'text-left'
      }`}>
        <div className={`inline-block p-4 rounded-2xl shadow-xl backdrop-blur-sm border ${
          message.type === 'user'
            ? 'bg-gradient-to-r from-blue-500/90 to-cyan-500/90 text-white border-blue-400/30'
            : message.isError
            ? 'bg-red-500/10 text-red-700 border-red-400/30'
            : 'bg-white/40 text-black border-white/20'
        }`}>
          {message.type === 'bot' ? (
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={components}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          )}
          
          {/* Temporarily disabled - uncomment to show sources */}
          {/* <MessageSources sources={message.sources} /> */}
        </div>
        
        <div className="text-xs text-gray-700 mt-2">
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
};

export default Message;
