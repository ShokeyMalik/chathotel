#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// WhatsApp message schema
const WhatsAppMessageSchema = z.object({
  to: z.string().describe('Phone number with country code (e.g., +1234567890)'),
  message: z.string().describe('Message content to send'),
  type: z.enum(['text', 'image', 'document']).default('text').describe('Message type'),
  mediaUrl: z.string().optional().describe('URL for media messages'),
});

const GetMessagesSchema = z.object({
  hotelId: z.string().describe('Hotel ID to get messages for'),
  phoneNumber: z.string().optional().describe('Filter by specific phone number'),
  limit: z.number().default(50).describe('Number of messages to retrieve'),
});

// In-memory storage for demo (replace with database in production)
interface WhatsAppMessage {
  id: string;
  hotelId: string;
  from: string;
  to: string;
  message: string;
  type: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

const messages: WhatsAppMessage[] = [];

const server = new Server(
  {
    name: 'chathotel-whatsapp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {
        listChanged: true,
      },
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'send_whatsapp_message',
        description: 'Send a WhatsApp message to a guest',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: {
              type: 'string',
              description: 'Hotel ID sending the message',
            },
            to: {
              type: 'string',
              description: 'Recipient phone number with country code',
            },
            message: {
              type: 'string',
              description: 'Message content to send',
            },
            type: {
              type: 'string',
              enum: ['text', 'image', 'document'],
              default: 'text',
              description: 'Message type',
            },
            mediaUrl: {
              type: 'string',
              description: 'URL for media messages (optional)',
            },
          },
          required: ['hotelId', 'to', 'message'],
        },
      },
      {
        name: 'get_whatsapp_messages',
        description: 'Get WhatsApp messages for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: {
              type: 'string',
              description: 'Hotel ID to get messages for',
            },
            phoneNumber: {
              type: 'string',
              description: 'Filter by specific phone number (optional)',
            },
            limit: {
              type: 'number',
              default: 50,
              description: 'Number of messages to retrieve',
            },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'get_whatsapp_conversations',
        description: 'Get all WhatsApp conversations for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: {
              type: 'string',
              description: 'Hotel ID to get conversations for',
            },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'mark_message_read',
        description: 'Mark a WhatsApp message as read',
        inputSchema: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'Message ID to mark as read',
            },
          },
          required: ['messageId'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'send_whatsapp_message': {
        const { hotelId, to, message, type = 'text', mediaUrl } = args as any;
        
        // Simulate sending message (replace with actual WhatsApp API call)
        const newMessage: WhatsAppMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          hotelId,
          from: `hotel_${hotelId}`,
          to,
          message,
          type,
          timestamp: new Date(),
          status: 'sent',
        };
        
        messages.push(newMessage);
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ WhatsApp message sent successfully!\n\n` +
                    `📱 To: ${to}\n` +
                    `💬 Message: ${message}\n` +
                    `📊 Status: ${newMessage.status}\n` +
                    `🆔 Message ID: ${newMessage.id}\n` +
                    `⏰ Sent: ${newMessage.timestamp.toISOString()}`,
            },
          ],
        };
      }

      case 'get_whatsapp_messages': {
        const { hotelId, phoneNumber, limit = 50 } = args as any;
        
        let filteredMessages = messages.filter(msg => 
          msg.hotelId === hotelId
        );
        
        if (phoneNumber) {
          filteredMessages = filteredMessages.filter(msg => 
            msg.from === phoneNumber || msg.to === phoneNumber
          );
        }
        
        filteredMessages = filteredMessages
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, limit);
        
        const messageList = filteredMessages.map(msg => 
          `📱 ${msg.from} → ${msg.to}\n` +
          `💬 ${msg.message}\n` +
          `📊 ${msg.status} | ⏰ ${msg.timestamp.toISOString()}\n` +
          `🆔 ${msg.id}\n`
        ).join('\n---\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `📱 WhatsApp Messages for Hotel ${hotelId}\n\n` +
                    `📊 Total messages: ${filteredMessages.length}\n` +
                    `${phoneNumber ? `📞 Filtered by: ${phoneNumber}\n` : ''}\n` +
                    `${messageList || '📭 No messages found'}`,
            },
          ],
        };
      }

      case 'get_whatsapp_conversations': {
        const { hotelId } = args as any;
        
        const hotelMessages = messages.filter(msg => msg.hotelId === hotelId);
        
        // Group by phone number
        const conversations = hotelMessages.reduce((acc, msg) => {
          const phoneNumber = msg.from.startsWith('hotel_') ? msg.to : msg.from;
          if (!acc[phoneNumber]) {
            acc[phoneNumber] = [];
          }
          acc[phoneNumber].push(msg);
          return acc;
        }, {} as Record<string, WhatsAppMessage[]>);
        
        const conversationList = Object.entries(conversations).map(([phone, msgs]) => {
          const lastMessage = msgs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
          const unreadCount = msgs.filter(msg => msg.status !== 'read').length;
          
          return `📞 ${phone}\n` +
                 `💬 Last: ${lastMessage.message.substring(0, 50)}${lastMessage.message.length > 50 ? '...' : ''}\n` +
                 `⏰ ${lastMessage.timestamp.toISOString()}\n` +
                 `📊 ${msgs.length} messages${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`;
        }).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `💬 WhatsApp Conversations for Hotel ${hotelId}\n\n` +
                    `📊 Total conversations: ${Object.keys(conversations).length}\n\n` +
                    `${conversationList || '📭 No conversations found'}`,
            },
          ],
        };
      }

      case 'mark_message_read': {
        const { messageId } = args as any;
        
        const message = messages.find(msg => msg.id === messageId);
        if (!message) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Message not found: ${messageId}`,
              },
            ],
          };
        }
        
        message.status = 'read';
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Message marked as read!\n\n` +
                    `🆔 Message ID: ${messageId}\n` +
                    `📱 From: ${message.from}\n` +
                    `💬 Message: ${message.message}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ChatHotel WhatsApp MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});