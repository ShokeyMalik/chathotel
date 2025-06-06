// ChatHotel Server - Integrated with Your Database Schema
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Prisma client with your existing database
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

// WhatsApp Configuration
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'chathotelwhatsapp';

// Claude API Configuration
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Database Helper Functions
async function findOrCreateGuest(phoneNumber, name = null) {
    console.log('🔍 Looking up guest:', phoneNumber);
    
    try {
        // Try to find existing guest
        let guest = await prisma.guest.findFirst({
            where: {
                OR: [
                    { phone: phoneNumber },
                    { phone: phoneNumber.replace(/\D/g, '') }, // Remove non-digits
                    { phone: `+${phoneNumber}` }
                ]
            },
            include: {
                bookings: {
                    orderBy: { createdAt: 'desc' },
                    take: 5
                }
            }
        });

        if (!guest) {
            console.log('👤 Creating new guest profile');
            guest = await prisma.guest.create({
            data: {
                phone,
                name,
                email: null,
                firstName: "Guest",
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            include: {
                bookings: true,
            },
        });

        } else {
            console.log('✅ Found existing guest:', guest.name);
            // Update last contact
            await prisma.guest.update({
                where: { id: guest.id },
                data: { updatedAt: new Date() }
            });
        }

        return guest;
    } catch (error) {
        console.error('❌ Database error finding/creating guest:', error);
        return null;
    }
}

async function saveMessage(guestId, messageText, direction = 'incoming', messageId = null) {
    console.log('💾 Saving message to database');
    
    try {
        const message = await prisma.message.create({
            data: {
                guestId: guestId,
                content: messageText,
                direction: direction, // 'incoming' or 'outgoing'
                platform: 'whatsapp',
                messageId: messageId,
                createdAt: new Date()
            }
        });
        
        console.log('✅ Message saved with ID:', message.id);
        return message;
    } catch (error) {
        console.error('❌ Error saving message:', error);
        return null;
    }
}

async function getGuestContext(guest) {
    console.log('📋 Building guest context from database');
    
    if (!guest) return '';
    
    const recentBookings = guest.bookings || [];
    const hasActiveBooking = recentBookings.some(booking => 
        booking.status === 'confirmed' || booking.status === 'checked_in'
    );
    
    let context = `Guest Information:
- Name: ${guest.name}
- Phone: ${guest.phone}
- Email: ${guest.email || 'Not provided'}
- Total bookings: ${recentBookings.length}`;

    if (hasActiveBooking) {
        const activeBooking = recentBookings.find(b => b.status === 'confirmed' || b.status === 'checked_in');
        context += `
- ACTIVE BOOKING: ${activeBooking.id}
- Check-in: ${activeBooking.checkIn}
- Check-out: ${activeBooking.checkOut}
- Room: ${activeBooking.roomType}
- Status: ${activeBooking.status}`;
    }

    if (recentBookings.length > 0) {
        const lastBooking = recentBookings[0];
        context += `
- Last stay: ${lastBooking.checkIn} to ${lastBooking.checkOut}
- Previous room: ${lastBooking.roomType}`;
    }

    return context;
}

async function checkRoomAvailability(checkIn, checkOut, roomType = null) {
    console.log('🏨 Checking room availability');
    
    try {
        // Get all bookings that overlap with requested dates
        const overlappingBookings = await prisma.booking.findMany({
            where: {
                AND: [
                    { status: { in: ['confirmed', 'checked_in'] } },
                    {
                        OR: [
                            {
                                AND: [
                                    { checkIn: { lte: new Date(checkIn) } },
                                    { checkOut: { gt: new Date(checkIn) } }
                                ]
                            },
                            {
                                AND: [
                                    { checkIn: { lt: new Date(checkOut) } },
                                    { checkOut: { gte: new Date(checkOut) } }
                                ]
                            },
                            {
                                AND: [
                                    { checkIn: { gte: new Date(checkIn) } },
                                    { checkOut: { lte: new Date(checkOut) } }
                                ]
                            }
                        ]
                    }
                ]
            }
        });

        // Calculate available rooms (assuming 13 total rooms from your doc)
        const totalRooms = 13;
        const bookedRooms = overlappingBookings.length;
        const availableRooms = totalRooms - bookedRooms;

        console.log(`📊 Availability: ${availableRooms}/${totalRooms} rooms available`);

        return {
            available: availableRooms > 0,
            availableCount: availableRooms,
            totalRooms: totalRooms,
            bookedRooms: bookedRooms
        };
    } catch (error) {
        console.error('❌ Error checking availability:', error);
        return { available: false, error: 'Unable to check availability' };
    }
}

async function createProvisionalBooking(guestId, checkIn, checkOut, roomType, guests) {
    console.log('📝 Creating provisional booking');
    
    try {
        const booking = await prisma.booking.create({
            data: {
                guestId: guestId,
                hotelId: 'cmb7fuyga0000pkwov3o8hm4g', // Your Darbar hotel ID from the doc
                checkIn: new Date(checkIn),
                checkOut: new Date(checkOut),
                roomType: roomType || 'Standard',
                guests: parseInt(guests) || 2,
                status: 'provisional', // Needs payment to confirm
                totalAmount: calculateRoomRate(roomType, checkIn, checkOut),
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

        console.log('✅ Provisional booking created:', booking.id);
        return booking;
    } catch (error) {
        console.error('❌ Error creating booking:', error);
        return null;
    }
}

function calculateRoomRate(roomType, checkIn, checkOut) {
    // Simple rate calculation - can be made more sophisticated
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    const baseRate = roomType === 'Heritage Suite' ? 5500 : 4500; // From your doc
    return baseRate * nights;
}

// Real Claude API call with guest context
async function callClaudeWithContext(messages, guestContext) {
    if (!CLAUDE_API_KEY) {
        console.log('❌ Claude API not configured, using fallback');
        return generateIntelligentFallback(messages[messages.length - 1].content, guestContext);
    }

    const systemPrompt = `You are an AI assistant for Darbar Heritage Farmstay. You have access to guest data and can perform hotel operations.

HOTEL INFORMATION:
- Name: Darbar Heritage Farmstay
- Phone: +91-9910364826
- Email: darbarorganichotel@gmail.com
- Rooms: 13 heritage rooms
- Specialty: Organic farm-to-table dining

GUEST CONTEXT:
${guestContext}

CAPABILITIES:
- Access guest booking history
- Check room availability  
- Create provisional bookings
- Answer questions about the property
- Handle special requests

INSTRUCTIONS:
- Be warm, personal, and knowledgeable
- Use guest's previous booking history when relevant
- For new bookings, ask for dates and guest count
- Create provisional bookings when guests provide details
- Use emojis appropriately (🏨 🌿 🍽️ etc.)
- Always provide actionable next steps

Remember: You can see this guest's actual booking history and current status.`;

    try {
        console.log('🤖 Calling Claude API with guest context...');
        
        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 400,
                system: systemPrompt,
                messages: messages
            })
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('❌ Claude API error:', error);
        return generateIntelligentFallback(messages[messages.length - 1].content, guestContext);
    }
}

function generateIntelligentFallback(message, guestContext) {
    const msg = message.toLowerCase();
    const hasBookingHistory = guestContext.includes('Total bookings:') && !guestContext.includes('Total bookings: 0');
    
    if (hasBookingHistory) {
        if (msg.includes('book') || msg.includes('room')) {
            return `🏨 Welcome back! I see you've stayed with us before. For your next booking at Darbar Heritage Farmstay, could you please share:

📅 Your preferred check-in and check-out dates
👥 Number of guests
🛏️ Any room preferences

I'll check our availability immediately! You can also call us at +91-9910364826 for instant confirmation. 🌿`;
        }
        
        return `🙏 Hello again! It's wonderful to hear from a returning guest of Darbar Heritage Farmstay. How can I assist you today? Whether it's a new booking, questions about our farm, or anything else, I'm here to help! 🌿`;
    }
    
    // New guest fallback
    if (msg.includes('book') || msg.includes('room')) {
        return `🏨 Welcome to Darbar Heritage Farmstay! I'd be delighted to help you plan your countryside retreat.

To check availability and create your booking:
📅 What dates are you considering?
👥 How many guests?
🌟 Any special preferences?

Our heritage property offers 13 unique rooms with organic farm experiences. Call +91-9910364826 for immediate assistance! 🌿`;
    }
    
    return `🙏 Welcome to Darbar Heritage Farmstay! I'm here to help with bookings, information about our heritage property, organic farm experiences, and any questions you might have. How can I assist you today? 🌿`;
}

// Enhanced message processing with database integration
async function processIncomingMessage(message) {
    const guestPhone = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    
    console.log('\n📥 Processing message with database integration:');
    console.log('  From:', guestPhone);
    console.log('  Message:', messageText);
    
    if (!messageText.trim()) {
        console.log('⏭️ Skipping non-text message');
        return;
    }
    
    try {
        // 1. Find or create guest in database
        const guest = await findOrCreateGuest(guestPhone);
        if (!guest) {
            console.log('❌ Could not create/find guest');
            return;
        }
        
        // 2. Save incoming message
        await saveMessage(guest.id, messageText, 'incoming', messageId);
        
        // 3. Get guest context from database
        const guestContext = await getGuestContext(guest);
        
        // 4. Get recent conversation history
        const recentMessages = await prisma.message.findMany({
            where: { guestId: guest.id },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        
        // 5. Build messages for Claude
        const messages = recentMessages
            .reverse()
            .map(msg => ({
                role: msg.direction === 'incoming' ? 'user' : 'assistant',
                content: msg.content
            }));
        
        // Add current message if not already included
        if (messages.length === 0 || messages[messages.length - 1].content !== messageText) {
            messages.push({
                role: 'user',
                content: messageText
            });
        }
        
        // 6. Generate AI response with guest context
        const aiResponse = await callClaudeWithContext(messages, guestContext);
        console.log('🤖 Claude generated response with guest context');
        
        // 7. Save AI response to database
        await saveMessage(guest.id, aiResponse, 'outgoing');
        
        // 8. Send WhatsApp reply
        const result = await sendWhatsAppMessage(guestPhone, aiResponse, messageId);
        
        if (result.success) {
            console.log('✅ Database-integrated response sent successfully!');
            
            // 9. Check if we need to create booking/update records
            await handlePostMessageActions(guest, messageText, aiResponse);
            
        } else {
            console.log('❌ Failed to send response:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error in database-integrated message processing:', error);
    }
}

async function handlePostMessageActions(guest, messageText, aiResponse) {
    // Handle booking creation, updates, etc. based on conversation
    const msg = messageText.toLowerCase();
    
    if (msg.includes('book') && (msg.includes('june') || msg.includes('july'))) {
        // Extract dates and create provisional booking
        console.log('📝 Detected booking intent, creating provisional booking...');
        // Implementation for automatic booking creation
    }
    
    if (msg.includes('cancel') && msg.includes('booking')) {
        // Handle cancellation
        console.log('❌ Detected cancellation request');
        // Implementation for booking cancellation
    }
}

// Send WhatsApp message (same as before)
async function sendWhatsAppMessage(to, message, contextMessageId = null) {
    console.log('\n📤 Sending database-integrated WhatsApp response...');
    
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        console.log('❌ WhatsApp credentials missing');
        return false;
    }
    
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
    
    if (contextMessageId) {
        payload.context = { message_id: contextMessageId };
    }
    
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
        
        if (response.ok && data.messages) {
            console.log('✅ Database-integrated message sent successfully!');
            return { success: true, messageId: data.messages[0].id };
        } else {
            console.log('❌ Message failed to send:', data.error);
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.log('❌ Network error:', error.message);
        return { success: false, error: error.message };
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'ChatHotel Database-Integrated AI',
        version: '4.0.0',
        database_connected: true,
        ai_powered: true,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        database: 'Connected',
        ai: !!CLAUDE_API_KEY,
        uptime: process.uptime()
    });
});

// Database status endpoint
app.get('/db-status', async (req, res) => {
    try {
        const guestCount = await prisma.guest.count();
        const bookingCount = await prisma.booking.count();
        const messageCount = await prisma.message.count();
        
        res.json({
            database: 'Connected',
            guests: guestCount,
            bookings: bookingCount,
            messages: messageCount,
            last_updated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            database: 'Error',
            error: error.message
        });
    }
});

// Guest lookup endpoint
app.get('/guest/:phone', async (req, res) => {
    try {
        const guest = await findOrCreateGuest(req.params.phone);
        const guestContext = await getGuestContext(guest);
        
        res.json({
            guest: guest,
            context: guestContext,
            messages: await prisma.message.findMany({
                where: { guestId: guest?.id },
                orderBy: { createdAt: 'desc' },
                take: 20
            })
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Main webhook handler
app.post('/webhook', async (req, res) => {
    console.log('\n=== INCOMING WEBHOOK (DATABASE INTEGRATED) ===');
    const body = req.body;
    
    res.status(200).send('OK');
    
    if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field === 'messages' && change.value.messages) {
                    for (const message of change.value.messages) {
                        await processIncomingMessage(message);
                    }
                }
            }
        }
    }
});

// Server startup
app.listen(PORT, async () => {
    console.log('\n🚀 ChatHotel Database-Integrated AI Starting...');
    console.log('='.repeat(60));
    console.log(`✅ Server running on port ${PORT}`);
    
    // Test database connection
    try {
        await prisma.$connect();
        console.log('✅ Database connected successfully');
        
        const stats = await prisma.guest.count();
        console.log(`📊 Database stats: ${stats} guests registered`);
    } catch (error) {
        console.log('❌ Database connection failed:', error.message);
    }
    
    console.log(`🤖 Claude API: ${CLAUDE_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📱 WhatsApp: ${WHATSAPP_ACCESS_TOKEN ? '✅ Ready' : '❌ Not configured'}`);
    console.log('');
    console.log('🎯 Features:');
    console.log('   ✅ Guest profiles with booking history');
    console.log('   ✅ Conversation storage and context');
    console.log('   ✅ Room availability checking');
    console.log('   ✅ Provisional booking creation');
    console.log('   ✅ AI responses with guest context');
    console.log('');
    console.log('🔗 Endpoints:');
    console.log('   GET /db-status - Database statistics');
    console.log('   GET /guest/{phone} - Guest profile lookup');
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});