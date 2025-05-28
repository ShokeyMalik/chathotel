#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

// WhatsApp Templates System
class WhatsAppTemplates {
  
  // 🎯 BOOKING FLOW TEMPLATES
  static bookingTemplates = {
    bookingConfirmation: (booking, hotel) => `🏨 *${hotel.name}* - Booking Confirmed!

📋 *Booking Reference:* ${booking.bookingReference}
👤 *Guest:* ${booking.guest.firstName} ${booking.guest.lastName}
🗓️ *Check-in:* ${new Date(booking.checkInDate).toDateString()}
🗓️ *Check-out:* ${new Date(booking.checkOutDate).toDateString()}
🌙 *Nights:* ${booking.nights}
🛏️ *Room:* ${booking.roomType.name}
👥 *Guests:* ${booking.adults} adults${booking.children > 0 ? `, ${booking.children} children` : ''}

💰 *Total Amount:* ₹${booking.totalAmount}
💳 *Paid:* ₹${booking.paidAmount}
${booking.paidAmount < booking.totalAmount ? `💸 *Balance Due:* ₹${booking.totalAmount - booking.paidAmount}` : ''}

${booking.specialRequests ? `📝 *Special Requests:* ${booking.specialRequests}\n` : ''}📞 *Contact:* ${hotel.phone}
📍 *Address:* ${hotel.address}

We look forward to welcoming you! 🎉`,

    paymentReminder: (booking, hotel, daysUntilCheckin) => `💳 *Payment Reminder* - ${hotel.name}

Hi ${booking.guest.firstName}! 👋

Your booking ${booking.bookingReference} is confirmed for ${new Date(booking.checkInDate).toDateString()} (${daysUntilCheckin} days away).

💰 *Outstanding Balance:* ₹${booking.totalAmount - booking.paidAmount}

Please complete payment to ensure smooth check-in.

*Payment Options:*
• UPI: ${hotel.phone}@paytm
• Card: Reply "PAY" for payment link
• Cash: At check-in

Questions? Reply to this message! 😊`,
  };

  // 🏨 PRE-ARRIVAL TEMPLATES
  static preArrivalTemplates = {
    preArrival24h: (booking, hotel) => `🎉 *Almost time for your stay!* - ${hotel.name}

Hi ${booking.guest.firstName}! 

You're checking in *tomorrow* (${new Date(booking.checkInDate).toDateString()}) 🗓️

*What to expect:*
✅ Check-in: 2:00 PM onwards
🆔 Please bring valid photo ID
🚗 Free parking available
📱 WiFi: ${hotel.name.replace(/\s/g, '')}Guest

*Need anything special?*
• Early check-in
• Late check-out  
• Transportation assistance
• Dinner reservations

Just reply to this message! Our team is ready to help 😊

📍 *Location:* ${hotel.address}
📞 *Contact:* ${hotel.phone}`,

    checkInDay: (booking, hotel, roomNumber = null) => `🏨 *Check-in Day!* - ${hotel.name}

Good morning ${booking.guest.firstName}! ☀️

*Your room is ready!*
${roomNumber ? `🚪 *Room:* ${roomNumber}\n` : ''}🛏️ *Type:* ${booking.roomType.name}

*Check-in Process:*
1️⃣ Visit reception with photo ID
2️⃣ Verify booking: ${booking.bookingReference}
3️⃣ Complete any pending payments
4️⃣ Receive room keys & welcome kit

*Hotel Amenities:*
📶 Free WiFi throughout
🍽️ Restaurant: 7 AM - 11 PM
☕ 24/7 Room service
🏊 Swimming pool: 6 AM - 10 PM

*Emergency Contact:* ${hotel.phone}

Have a wonderful stay with us! 🌟`,
  };

  // 🤖 AUTO-RESPONSES FOR COMMON QUERIES
  static autoResponses = {
    wifi: (hotel) => `📶 *WiFi Details* - ${hotel.name}

*Network:* ${hotel.name.replace(/\s/g, '')}Guest
*Password:* Welcome2024

*Backup Network:* ${hotel.name.replace(/\s/g, '')}Staff  
*Password:* ${hotel.slug}2024

*Having trouble?* Call reception: ${hotel.phone} 📞`,

    directions: (hotel) => `📍 *Location & Directions* - ${hotel.name}

*Address:* ${hotel.address}
${hotel.city ? `*City:* ${hotel.city}\n` : ''}
*Getting here:*
🚕 Taxi: "Take me to ${hotel.name}"
🚗 Car: Use GPS or search "${hotel.name}"
🚌 Bus: Nearest stop is ${hotel.city} Central

*Need pickup?* Reply with arrival time and location 🚗`,

    roomService: (hotel) => `🍽️ *Room Service Menu* - ${hotel.name}

*🌅 Breakfast (7 AM - 11 AM)*
• Continental: ₹650
• Indian: ₹550  
• Fresh Juice: ₹250

*🍛 Lunch/Dinner (12 PM - 11 PM)*
• Veg Thali: ₹850
• Non-veg Thali: ₹950
• Pizza: ₹750-₹1200

*☕ Beverages (24/7)*
• Tea/Coffee: ₹150
• Fresh Lime: ₹200

*📱 To Order:*
Reply with item name and quantity
Example: "Continental breakfast x2"

*Delivery:* 20-30 minutes
Bon appétit! 🍴`,

    emergency: (hotel) => `🚨 *Emergency Contacts*

*Hotel Reception:* ${hotel.phone}
*Manager on duty:* Available 24/7

*Medical Emergency:*
🏥 City Hospital: +91-9876543210
🚑 Ambulance: 108

*Police:* 100 | *Fire:* 101

Stay safe! 🛡️`,

    complaint: (hotel, guestName) => `😔 *We're Sorry* - ${hotel.name}

Hi ${guestName},

We sincerely apologize for any inconvenience. Your comfort is our priority.

*Immediate Action:*
🏃‍♂️ Manager will contact you within 10 minutes
📞 Direct line: ${hotel.phone} (ask for duty manager)

Thank you for bringing this to our attention 🙏`,
  };

  // 🎯 SMART RESPONSE SYSTEM
  static getSmartResponse(messageContent, context = {}) {
    const content = messageContent.toLowerCase();
    const { hotel, booking, guest } = context;
    
    if (content.includes('wifi') || content.includes('internet') || content.includes('password')) {
      return this.autoResponses.wifi(hotel);
    }
    
    if (content.includes('direction') || content.includes('location') || content.includes('address')) {
      return this.autoResponses.directions(hotel);
    }
    
    if (content.includes('emergency') || content.includes('help') || content.includes('urgent')) {
      return this.autoResponses.emergency(hotel);
    }
    
    if (content.includes('menu') || content.includes('food') || content.includes('restaurant')) {
      return this.autoResponses.roomService(hotel);
    }
    
    if (content.includes('clean') || content.includes('housekeeping') || content.includes('towel')) {
      return "🧹 Housekeeping request noted! What time would work best for you? Reply with your preferred time (9 AM - 6 PM).";
    }
    
    if (content.includes('problem') || content.includes('issue') || content.includes('complaint')) {
      return this.autoResponses.complaint(hotel, guest?.firstName || 'Guest');
    }
    
    // Default helpful response
    return `Hi! 👋 I'm here to help with your stay at ${hotel.name}.

*Quick requests:*
• "WiFi" - Internet details
• "Menu" - Room service  
• "Clean" - Housekeeping
• "Directions" - Location
• "Help" - Emergency contacts

*Or ask me anything!* Our team responds within 5 minutes 😊`;
  }
}

function generateWhatsAppMessageId() {
  return `wamid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatMessage(message) {
  const direction = message.direction === 'inbound' ? '📥' : '📤';
  const timestamp = new Date(message.createdAt).toLocaleString();
  
  return `${direction} ${message.direction.toUpperCase()}\n` +
         `📞 ${message.guestPhone}\n` +
         `💬 ${message.content}\n` +
         `📊 ${message.status} | ⏰ ${timestamp}\n` +
         `🆔 ${message.id}${message.booking ? `\n📋 Booking: ${message.booking.bookingReference}` : ''}`;
}

function formatConversation(phone, messages, guest = null) {
  const lastMessage = messages[0];
  const unreadCount = messages.filter(m => m.direction === 'inbound' && m.status !== 'read').length;
  
  return `📞 ${phone}${guest ? ` (${guest.firstName} ${guest.lastName})` : ''}\n` +
         `💬 Last: ${lastMessage.content.substring(0, 50)}${lastMessage.content.length > 50 ? '...' : ''}\n` +
         `⏰ ${new Date(lastMessage.createdAt).toLocaleString()}\n` +
         `📊 ${messages.length} messages${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}\n` +
         `${guest?.vipStatus ? '⭐ VIP Guest\n' : ''}` +
         `🆔 Guest ID: ${guest?.id || 'Unknown'}`;
}

const server = new Server(
  {
    name: 'chathotel-whatsapp',
    version: '3.0.0',
  },
  {
    capabilities: {
      tools: {},
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
            hotelId: { type: 'string', description: 'Hotel ID sending the message' },
            to: { type: 'string', description: 'Recipient phone number with country code' },
            message: { type: 'string', description: 'Message content to send' },
            messageType: { type: 'string', enum: ['text', 'image', 'document', 'audio'], default: 'text' },
            bookingId: { type: 'string', description: 'Associated booking ID (optional)' },
          },
          required: ['hotelId', 'to', 'message'],
        },
      },
      {
        name: 'send_booking_confirmation',
        description: 'Send automated booking confirmation with template',
        inputSchema: {
          type: 'object',
          properties: {
            bookingId: { type: 'string', description: 'Booking ID to send confirmation for' },
          },
          required: ['bookingId'],
        },
      },
      {
        name: 'send_smart_reply',
        description: 'Send intelligent auto-response based on guest message',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            guestPhone: { type: 'string', description: 'Guest phone number' },
            guestMessage: { type: 'string', description: 'Guest message to respond to' },
          },
          required: ['hotelId', 'guestPhone', 'guestMessage'],
        },
      },
      {
        name: 'send_pre_arrival_message',
        description: 'Send pre-arrival message to guest',
        inputSchema: {
          type: 'object',
          properties: {
            bookingId: { type: 'string', description: 'Booking ID' },
            type: { type: 'string', enum: ['24h_before', 'checkin_day'], description: 'Message type' },
          },
          required: ['bookingId', 'type'],
        },
      },
      {
        name: 'get_whatsapp_messages',
        description: 'Get WhatsApp messages for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            guestPhone: { type: 'string', description: 'Filter by guest phone (optional)' },
            limit: { type: 'number', default: 50, description: 'Number of messages' },
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
            hotelId: { type: 'string', description: 'Hotel ID' },
            unreadOnly: { type: 'boolean', default: false, description: 'Show only unread conversations' },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'mark_messages_read',
        description: 'Mark WhatsApp messages as read',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            guestPhone: { type: 'string', description: 'Guest phone number' },
          },
          required: ['hotelId', 'guestPhone'],
        },
      },
      {
        name: 'save_incoming_message',
        description: 'Save incoming WhatsApp message (webhook handler)',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            whatsappMessageId: { type: 'string', description: 'WhatsApp message ID' },
            guestPhone: { type: 'string', description: 'Sender phone' },
            content: { type: 'string', description: 'Message content' },
            messageType: { type: 'string', enum: ['text', 'image', 'document', 'audio'], default: 'text' },
          },
          required: ['hotelId', 'whatsappMessageId', 'guestPhone', 'content'],
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
        let guest = await prisma.guest.findFirst({
          where: { hotelId: args.hotelId, phone: args.to },
        });

        const whatsappMessageId = generateWhatsAppMessageId();
        
        const newMessage = await prisma.whatsAppMessage.create({
          data: {
            hotelId: args.hotelId,
            whatsappMessageId,
            guestPhone: args.to,
            guestId: guest?.id,
            bookingId: args.bookingId,
            content: args.message,
            messageType: args.messageType || 'text',
            direction: 'outbound',
            status: 'sent',
          },
          include: {
            guest: true,
            booking: { select: { bookingReference: true } },
          },
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ WhatsApp message sent successfully!\n\n` +
                    `📱 To: ${args.to}${guest ? ` (${guest.firstName} ${guest.lastName})` : ''}\n` +
                    `💬 Message: ${args.message}\n` +
                    `📊 Status: ${newMessage.status}\n` +
                    `⏰ Sent: ${newMessage.createdAt.toISOString()}`,
            },
          ],
        };
      }

      case 'send_booking_confirmation': {
        const booking = await prisma.booking.findUnique({
          where: { id: args.bookingId },
          include: {
            hotel: true,
            guest: true,
            roomType: true,
          },
        });

        if (!booking) {
          return {
            content: [{ type: 'text', text: `❌ Booking not found: ${args.bookingId}` }],
          };
        }

        const message = WhatsAppTemplates.bookingTemplates.bookingConfirmation(booking, booking.hotel);
        const whatsappMessageId = generateWhatsAppMessageId();
        
        await prisma.whatsAppMessage.create({
          data: {
            hotelId: booking.hotelId,
            whatsappMessageId,
            guestPhone: booking.guest.phone,
            guestId: booking.guest.id,
            bookingId: booking.id,
            content: message,
            messageType: 'text',
            direction: 'outbound',
            status: 'sent',
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Booking confirmation sent to ${booking.guest.firstName} ${booking.guest.lastName}!\n\n` +
                    `📋 Booking: ${booking.bookingReference}\n` +
                    `📱 Phone: ${booking.guest.phone}\n` +
                    `🏨 Hotel: ${booking.hotel.name}\n\n` +
                    `*Message sent:*\n${message.substring(0, 200)}...`,
            },
          ],
        };
      }

      case 'send_smart_reply': {
        const hotel = await prisma.hotel.findUnique({
          where: { id: args.hotelId },
        });

        const guest = await prisma.guest.findFirst({
          where: { hotelId: args.hotelId, phone: args.guestPhone },
        });

        const booking = await prisma.booking.findFirst({
          where: { 
            hotelId: args.hotelId,
            guestId: guest?.id,
            status: { in: ['CONFIRMED', 'CHECKED_IN'] }
          },
          include: { roomType: true },
          orderBy: { createdAt: 'desc' },
        });

        if (!hotel) {
          return {
            content: [{ type: 'text', text: `❌ Hotel not found: ${args.hotelId}` }],
          };
        }

        const smartResponse = WhatsAppTemplates.getSmartResponse(args.guestMessage, {
          hotel,
          guest,
          booking,
        });

        const whatsappMessageId = generateWhatsAppMessageId();
        
        await prisma.whatsAppMessage.create({
          data: {
            hotelId: args.hotelId,
            whatsappMessageId,
            guestPhone: args.guestPhone,
            guestId: guest?.id,
            bookingId: booking?.id,
            content: smartResponse,
            messageType: 'text',
            direction: 'outbound',
            status: 'sent',
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `🤖 Smart reply sent to ${args.guestPhone}!\n\n` +
                    `📥 Guest asked: "${args.guestMessage}"\n\n` +
                    `📤 Auto-response sent:\n${smartResponse.substring(0, 300)}...`,
            },
          ],
        };
      }

      case 'send_pre_arrival_message': {
        const booking = await prisma.booking.findUnique({
          where: { id: args.bookingId },
          include: {
            hotel: true,
            guest: true,
            roomType: true,
          },
        });

        if (!booking) {
          return {
            content: [{ type: 'text', text: `❌ Booking not found: ${args.bookingId}` }],
          };
        }

        let message;
        if (args.type === '24h_before') {
          message = WhatsAppTemplates.preArrivalTemplates.preArrival24h(booking, booking.hotel);
        } else if (args.type === 'checkin_day') {
          message = WhatsAppTemplates.preArrivalTemplates.checkInDay(booking, booking.hotel);
        }

        const whatsappMessageId = generateWhatsAppMessageId();
        
        await prisma.whatsAppMessage.create({
          data: {
            hotelId: booking.hotelId,
            whatsappMessageId,
            guestPhone: booking.guest.phone,
            guestId: booking.guest.id,
            bookingId: booking.id,
            content: message,
            messageType: 'text',
            direction: 'outbound',
            status: 'sent',
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Pre-arrival message sent!\n\n` +
                    `👤 Guest: ${booking.guest.firstName} ${booking.guest.lastName}\n` +
                    `📋 Booking: ${booking.bookingReference}\n` +
                    `📱 Phone: ${booking.guest.phone}\n` +
                    `📅 Check-in: ${new Date(booking.checkInDate).toDateString()}\n\n` +
                    `*Message type:* ${args.type}`,
            },
          ],
        };
      }

      case 'get_whatsapp_messages': {
        const whereClause = { hotelId: args.hotelId };
        
        if (args.guestPhone) {
          whereClause.guestPhone = args.guestPhone;
        }
        
        const messages = await prisma.whatsAppMessage.findMany({
          where: whereClause,
          include: {
            guest: { select: { firstName: true, lastName: true } },
            booking: { select: { bookingReference: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: args.limit || 50,
        });
        
        if (messages.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📭 No messages found for the specified criteria`,
              },
            ],
          };
        }
        
        const messageList = messages.map(formatMessage).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `📱 WhatsApp Messages\n\n` +
                    `📊 Total: ${messages.length} messages\n` +
                    `${args.guestPhone ? `📞 Filtered by: ${args.guestPhone}\n` : ''}\n` +
                    `${messageList}`,
            },
          ],
        };
      }

      case 'get_whatsapp_conversations': {
        const messages = await prisma.whatsAppMessage.findMany({
          where: { hotelId: args.hotelId },
          include: {
            guest: { select: { id: true, firstName: true, lastName: true, vipStatus: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        
        const conversations = {};
        messages.forEach(message => {
          if (!conversations[message.guestPhone]) {
            conversations[message.guestPhone] = {
              messages: [],
              guest: message.guest,
            };
          }
          conversations[message.guestPhone].messages.push(message);
        });
        
        let conversationList = Object.entries(conversations);
        
        if (args.unreadOnly) {
          conversationList = conversationList.filter(([phone, data]) => 
            data.messages.some(msg => msg.direction === 'inbound' && msg.status !== 'read')
          );
        }
        
        if (conversationList.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📭 No conversations found${args.unreadOnly ? ' with unread messages' : ''}`,
              },
            ],
          };
        }
        
        const conversationSummary = conversationList.map(([phone, data]) => 
          formatConversation(phone, data.messages, data.guest)
        ).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `💬 WhatsApp Conversations\n\n` +
                    `📊 Total: ${conversationList.length} conversations\n` +
                    `${args.unreadOnly ? '🔴 Showing only unread\n' : ''}\n` +
                    `${conversationSummary}`,
            },
          ],
        };
      }

      case 'mark_messages_read': {
        const result = await prisma.whatsAppMessage.updateMany({
          where: {
            hotelId: args.hotelId,
            guestPhone: args.guestPhone,
            direction: 'inbound',
            status: { not: 'read' },
          },
          data: {
            status: 'read',
            readAt: new Date(),
          },
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Marked ${result.count} messages as read for ${args.guestPhone}`,
            },
          ],
        };
      }

      case 'save_incoming_message': {
        let guest = await prisma.guest.findFirst({
          where: { hotelId: args.hotelId, phone: args.guestPhone },
        });
        
        let booking = null;
        if (guest) {
          booking = await prisma.booking.findFirst({
            where: {
              guestId: guest.id,
              status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
            },
            orderBy: { createdAt: 'desc' },
          });
        }
        
        const newMessage = await prisma.whatsAppMessage.create({
          data: {
            hotelId: args.hotelId,
            whatsappMessageId: args.whatsappMessageId,
            guestPhone: args.guestPhone,
            guestId: guest?.id,
            bookingId: booking?.id,
            content: args.content,
            messageType: args.messageType || 'text',
            direction: 'inbound',
            status: 'delivered',
          },
          include: {
            guest: true,
            booking: { select: { bookingReference: true } },
          },
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Incoming message saved!\n\n` +
                    `📱 From: ${args.guestPhone}${guest ? ` (${guest.firstName} ${guest.lastName})` : ''}\n` +
                    `💬 Message: ${args.content}\n` +
                    `⏰ Received: ${newMessage.createdAt.toISOString()}\n` +
                    `${booking ? `📋 Booking: ${booking.bookingReference}\n` : ''}` +
                    `${!guest ? '⚠️ Unknown guest - consider creating profile\n' : ''}`,
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
  console.error('ChatHotel WhatsApp MCP Server (Enhanced Templates) running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});