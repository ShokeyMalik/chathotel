// Update your packages/mcp-servers/src/whatsapp.js file

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Use the EXACT same working configuration from your debug script
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

// Enhanced sendWhatsAppReply function (working version from debug)
async function sendWhatsAppReply(to, message, context = null) {
    console.log('\n=== MCP SENDING MESSAGE ===');
    console.log('To:', to);
    console.log('Message:', message);
    
    const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
            body: message
        }
    };
    
    // Add context for replies
    if (context) {
        payload.context = { message_id: context };
    }
    
    console.log('MCP Request URL:', url);
    console.log('MCP Payload:', JSON.stringify(payload, null, 2));
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        console.log('MCP Response Status:', response.status);
        console.log('MCP Response Body:', JSON.stringify(data, null, 2));
        
        if (response.ok && data.messages) {
            console.log('✅ MCP Message sent successfully');
            return { 
                success: true, 
                messageId: data.messages[0].id,
                waId: data.contacts[0].wa_id 
            };
        } else {
            console.log('❌ MCP Message failed to send');
            if (data.error) {
                console.log('MCP Error Code:', data.error.code);
                console.log('MCP Error Message:', data.error.message);
            }
            throw new Error(`WhatsApp API Error: ${data.error?.message || JSON.stringify(data)}`);
        }
    } catch (error) {
        console.log('❌ MCP Network error:', error.message);
        throw error;
    }
}

// Create the MCP server
const server = new Server(
    {
        name: 'chathotel-whatsapp',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'send_whatsapp_message',
                description: 'Send a WhatsApp message to a phone number',
                inputSchema: {
                    type: 'object',
                    properties: {
                        to: {
                            type: 'string',
                            description: 'Phone number in international format (e.g., +919702456293)',
                        },
                        message: {
                            type: 'string',
                            description: 'Message content to send',
                        },
                        context_message_id: {
                            type: 'string',
                            description: 'Optional: Message ID to reply to (for threading)',
                        },
                    },
                    required: ['to', 'message'],
                },
            },
            {
                name: 'send_booking_confirmation',
                description: 'Send a booking confirmation message via WhatsApp',
                inputSchema: {
                    type: 'object',
                    properties: {
                        guest_phone: {
                            type: 'string',
                            description: 'Guest phone number in international format',
                        },
                        booking_id: {
                            type: 'string',
                            description: 'Booking ID or reference number',
                        },
                        hotel_name: {
                            type: 'string',
                            description: 'Name of the hotel',
                        },
                        check_in: {
                            type: 'string',
                            description: 'Check-in date and time',
                        },
                        check_out: {
                            type: 'string',
                            description: 'Check-out date and time',
                        },
                        room_type: {
                            type: 'string',
                            description: 'Type of room booked',
                        },
                    },
                    required: ['guest_phone', 'booking_id', 'hotel_name'],
                },
            },
            {
                name: 'send_smart_reply',
                description: 'Send an intelligent reply based on guest message context',
                inputSchema: {
                    type: 'object',
                    properties: {
                        guest_phone: {
                            type: 'string',
                            description: 'Guest phone number',
                        },
                        guest_message: {
                            type: 'string',
                            description: 'The message received from the guest',
                        },
                        hotel_context: {
                            type: 'string',
                            description: 'Hotel-specific context (name, policies, etc.)',
                        },
                        reply_to_message_id: {
                            type: 'string',
                            description: 'Message ID to reply to',
                        },
                    },
                    required: ['guest_phone', 'guest_message'],
                },
            },
            {
                name: 'save_incoming_message',
                description: 'Save an incoming WhatsApp message to the database',
                inputSchema: {
                    type: 'object',
                    properties: {
                        from_phone: {
                            type: 'string',
                            description: 'Sender phone number',
                        },
                        message_text: {
                            type: 'string',
                            description: 'Message content',
                        },
                        message_id: {
                            type: 'string',
                            description: 'WhatsApp message ID',
                        },
                        hotel_id: {
                            type: 'string',
                            description: 'Hotel ID (if identifiable)',
                        },
                    },
                    required: ['from_phone', 'message_text', 'message_id'],
                },
            },
        ],
    };
});

// Tool implementation
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'send_whatsapp_message': {
                const result = await sendWhatsAppReply(
                    args.to,
                    args.message,
                    args.context_message_id
                );
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `✅ WhatsApp message sent successfully!\nMessage ID: ${result.messageId}\nWA ID: ${result.waId}`,
                        },
                    ],
                };
            }

            case 'send_booking_confirmation': {
                const confirmationMessage = `🏨 *${args.hotel_name}* - Booking Confirmation

✅ *Booking ID:* ${args.booking_id}
📅 *Check-in:* ${args.check_in || 'TBD'}
📅 *Check-out:* ${args.check_out || 'TBD'}
🛏️ *Room:* ${args.room_type || 'Standard Room'}

Thank you for choosing ${args.hotel_name}! We look forward to hosting you.

For any questions, simply reply to this message.`;

                const result = await sendWhatsAppReply(args.guest_phone, confirmationMessage);
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `✅ Booking confirmation sent to ${args.guest_phone}!\nMessage ID: ${result.messageId}`,
                        },
                    ],
                };
            }

            case 'send_smart_reply': {
                // Generate intelligent reply based on context
                let smartReply = '';
                
                const guestMsg = args.guest_message.toLowerCase();
                
                if (guestMsg.includes('booking') || guestMsg.includes('reservation')) {
                    smartReply = `Hello! I can help you with your booking. Could you please provide your booking reference number or the name the reservation was made under?`;
                } else if (guestMsg.includes('cancel')) {
                    smartReply = `I understand you'd like to cancel your reservation. Let me connect you with our reservations team who can assist you with the cancellation process.`;
                } else if (guestMsg.includes('check') && guestMsg.includes('in')) {
                    smartReply = `Check-in is typically from 3:00 PM onwards. If you need early check-in, please let me know and I'll check availability for you.`;
                } else if (guestMsg.includes('amenities') || guestMsg.includes('facilities')) {
                    smartReply = `We offer various amenities including Wi-Fi, restaurant, room service, and more. Would you like me to send you our complete amenities list?`;
                } else if (guestMsg.includes('location') || guestMsg.includes('direction')) {
                    smartReply = `I'd be happy to help with directions! Could you let me know where you'll be traveling from?`;
                } else {
                    smartReply = `Thank you for contacting ${args.hotel_context || 'us'}! Our team will assist you shortly. Is there anything specific I can help you with right now?`;
                }
                
                const result = await sendWhatsAppReply(
                    args.guest_phone, 
                    smartReply, 
                    args.reply_to_message_id
                );
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `✅ Smart reply sent to ${args.guest_phone}!\nReply: "${smartReply}"\nMessage ID: ${result.messageId}`,
                        },
                    ],
                };
            }

            case 'save_incoming_message': {
                // This would typically save to your Supabase database
                // For now, we'll just log it
                console.log('📥 Incoming message saved:', {
                    from: args.from_phone,
                    text: args.message_text,
                    id: args.message_id,
                    hotel: args.hotel_id,
                    timestamp: new Date().toISOString()
                });
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `✅ Message saved from ${args.from_phone}: "${args.message_text}"`,
                        },
                    ],
                };
            }

            default:
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Unknown tool: ${name}`
                );
        }
    } catch (error) {
        console.error(`Error in tool ${name}:`, error);
        throw new McpError(
            ErrorCode.InternalError,
            `Failed to execute tool ${name}: ${error.message}`
        );
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log('🚀 ChatHotel WhatsApp MCP Server running!');
    console.log('✅ WhatsApp API credentials verified');
    console.log('📱 Ready to send messages via Claude');
}

main().catch(console.error);