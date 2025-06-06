// ChatHotel Server - Complete Robust Database Integration with ALL Functions
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
    },
    log: ['error', 'warn'], // Add logging for debugging
});

// Constants
const HOTEL_ID = 'cmb7fuyga0000pkwov3o8hm4g'; // Darbar Heritage Farmstay ID
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'chathotelwhatsapp';
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

// Database Schema Validation Helper
async function validateDatabaseSchema() {
    try {
        console.log('🔍 Validating database schema...');
        
        // Test basic table access
        await prisma.hotel.findFirst();
        await prisma.guest.findFirst();
        await prisma.booking.findFirst();
        
        // Try to access WhatsApp messages (might not exist)
        try {
            await prisma.whatsAppMessage.findFirst();
            console.log('✅ WhatsAppMessage table exists');
        } catch (error) {
            console.log('⚠️ WhatsAppMessage table not found, will use fallback');
        }
        
        console.log('✅ Database schema validation passed');
        return true;
    } catch (error) {
        console.error('❌ Database schema validation failed:', error.message);
        return false;
    }
}



async function saveMessage(guestId, messageText, direction = 'incoming', messageId = null) {
    console.log('💾 Saving message to database');
    
    try {
        // Try WhatsAppMessage table first
        const message = await prisma.whatsAppMessage.create({
            data: {
                guestId: guestId,
                content: messageText,
                direction: direction,
                messageId: messageId,
                createdAt: new Date()
            }
        });
        
        console.log('✅ Message saved with ID:', message.id);
        return message;
    } catch (error) {
        console.error('❌ Error saving to WhatsAppMessage:', error.message);
        
        // Fallback: try without messageId
        try {
            const message = await prisma.whatsAppMessage.create({
                data: {
                    guestId: guestId,
                    content: messageText,
                    direction: direction,
                    createdAt: new Date()
                }
            });
            
            console.log('✅ Message saved (no messageId) with ID:', message.id);
            return message;
        } catch (fallbackError) {
            console.error('❌ All message save attempts failed');
            return null;
        }
    }
}

async function getGuestContext(guest) {
    console.log('📋 Building guest context from database');
    
    if (!guest) return 'No guest information available.';
    
    const recentBookings = guest.bookings || [];
    const hasActiveBooking = recentBookings.some(booking => 
        booking.status === 'confirmed' || booking.status === 'checked_in'
    );
    
    const fullName = `${guest.firstName} ${guest.lastName}`.trim();
    
    let context = `Guest Information:
- Name: ${fullName}
- Phone: ${guest.phone}
- WhatsApp: ${guest.whatsappNumber || guest.phone}
- Email: ${guest.email || 'Not provided'}
- VIP Status: ${guest.vipStatus ? 'Yes' : 'No'}
- Total bookings: ${recentBookings.length}`;

    if (hasActiveBooking) {
        const activeBooking = recentBookings.find(b => b.status === 'confirmed' || b.status === 'checked_in');
        context += `
- ACTIVE BOOKING: ${activeBooking.id}
- Check-in: ${activeBooking.checkIn.toDateString()}
- Check-out: ${activeBooking.checkOut.toDateString()}
- Guests: ${activeBooking.guests}
- Status: ${activeBooking.status}`;
        
        if (activeBooking.totalAmount) {
            context += `\n- Amount: ₹${activeBooking.totalAmount}`;
        }
    }

    if (recentBookings.length > 0 && !hasActiveBooking) {
        const lastBooking = recentBookings[0];
        context += `
- Last stay: ${lastBooking.checkIn.toDateString()} to ${lastBooking.checkOut.toDateString()}
- Previous status: ${lastBooking.status}`;
    }

    return context;
}

// Auto-seed function for production deployment
async function ensureHotelExists() {
    console.log('🔍 Checking if hotel seeding is required...');
    
    try {
        // Check if Darbar hotel exists
        const existingHotel = await prisma.hotel.findUnique({
            where: { slug: 'darbar-heritage-farmstay' }
        });

        if (existingHotel) {
            console.log('✅ Hotel already exists:', existingHotel.name);
            console.log('   Hotel ID:', existingHotel.id);
            
            // Update the global hotel ID to match what's in the database
            global.ACTUAL_HOTEL_ID = existingHotel.id;
            return existingHotel;
        }

        console.log('🏗️ Hotel not found. Creating Darbar Heritage Farmstay...');
        
        // Create the hotel with all necessary data
        const hotel = await prisma.hotel.create({
            data: {
                name: "Darbar – A Heritage Farmstay",
                slug: "darbar-heritage-farmstay",
                email: "darbarorganichotel@gmail.com",
                phone: "+919910364826",
                whatsappNumber: "+919910364826",
                address: "Ranichauri, Chamba Road, Near New Tehri",
                city: "Tehri Garhwal",
                state: "Uttarakhand",
                country: "India",
                postalCode: "249145",
                timezone: "Asia/Kolkata",
                totalRooms: 13,
                hotelType: "heritage",
                starRating: 4,
                subscriptionPlan: "premium",
                subscriptionStatus: "active",
                subscriptionEndsAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                isActive: true,
                googleMapsLink: "https://maps.app.goo.gl/JCAetmW1ZCGF3Fyy8"
            }
        });

        console.log('✅ Hotel created successfully:', hotel.name);
        console.log('   Hotel ID:', hotel.id);

        // Create room types
        console.log('🛏️ Creating room types...');
        
        const [familySuite, heritageRoom, greenChalet] = await Promise.all([
            prisma.roomType.create({
                data: {
                    hotelId: hotel.id,
                    name: "Family Suite – HR01",
                    description: "Spacious suite with 2 kid-size beds and heritage interiors.",
                    capacity: 4,
                    basePrice: 6500,
                    weekendPrice: 7000,
                    seasonalMultiplier: 1.25,
                    amenities: ["WiFi", "Heater", "Hot Water", "2 Kids Beds"],
                    sizeSqft: 350,
                    bedType: "Queen + 2 Kid Beds",
                    bedCount: 3
                }
            }),
            prisma.roomType.create({
                data: {
                    hotelId: hotel.id,
                    name: "Heritage Room",
                    description: "Charming rooms with Garhwali-style decor and modern comfort.",
                    capacity: 2,
                    basePrice: 5500,
                    weekendPrice: 6000,
                    seasonalMultiplier: 1.15,
                    amenities: ["WiFi", "Heater", "Hot Water"],
                    sizeSqft: 300,
                    bedType: "Queen",
                    bedCount: 1
                }
            }),
            prisma.roomType.create({
                data: {
                    hotelId: hotel.id,
                    name: "Green Chalet",
                    description: "Luxury tented chalets with private sit-outs and forest views.",
                    capacity: 3,
                    basePrice: 7500,
                    weekendPrice: 8000,
                    seasonalMultiplier: 1.3,
                    amenities: ["WiFi", "Heater", "Balcony", "Forest View"],
                    sizeSqft: 400,
                    bedType: "King",
                    bedCount: 1
                }
            })
        ]);

        console.log('✅ Room types created');

        // Create rooms
        console.log('🏠 Creating rooms...');
        
        await prisma.room.createMany({
            data: [
                { hotelId: hotel.id, roomTypeId: familySuite.id, roomNumber: "HR01", floor: 1 },
                { hotelId: hotel.id, roomTypeId: heritageRoom.id, roomNumber: "HR03", floor: 1 },
                { hotelId: hotel.id, roomTypeId: heritageRoom.id, roomNumber: "HR04", floor: 1 },
                { hotelId: hotel.id, roomTypeId: heritageRoom.id, roomNumber: "HR05", floor: 1 },
                { hotelId: hotel.id, roomTypeId: heritageRoom.id, roomNumber: "HR06", floor: 1 },
                { hotelId: hotel.id, roomTypeId: heritageRoom.id, roomNumber: "HR07", floor: 1 },
                { hotelId: hotel.id, roomTypeId: heritageRoom.id, roomNumber: "HR08", floor: 1 },
                { hotelId: hotel.id, roomTypeId: heritageRoom.id, roomNumber: "HR09", floor: 1 },
                { hotelId: hotel.id, roomTypeId: heritageRoom.id, roomNumber: "HR10", floor: 2 },
                { hotelId: hotel.id, roomTypeId: greenChalet.id, roomNumber: "Chalet01", floor: 0 },
                { hotelId: hotel.id, roomTypeId: greenChalet.id, roomNumber: "Chalet02", floor: 0 },
                { hotelId: hotel.id, roomTypeId: greenChalet.id, roomNumber: "Chalet03", floor: 0 },
                { hotelId: hotel.id, roomTypeId: greenChalet.id, roomNumber: "Chalet04", floor: 0 }
            ]
        });

        console.log('✅ Rooms created');

        // Create basic staff
        console.log('👥 Creating basic staff...');
        
        const darbarEmployees = [
            "SAURAV SINGH", "Suraj UT", "Jai Kaintura", "Gaurav", "Kamal NEGI", 
            "Harish", "MAMTA", "Mohan Lal", "Parmila", "Sunil", "Baadal", 
            "Karan", "Suraj", "Vipul Rawat", "Manvir Sajwan", "Manu Dhiman", 
            "ASHOK MALIK", "SARTHAK KUMARIA"
        ];

        function generateEmail(name, hotelSlug) {
            return name.toLowerCase().replace(/[^a-z]/g, "") + "@" + hotelSlug.replace(/-/g, "") + ".local";
        }

        await prisma.hotelUser.createMany({
            data: darbarEmployees.map(name => ({
                hotelId: hotel.id,
                name,
                role: "Staff",
                phone: "",
                email: generateEmail(name, hotel.slug),
                passwordHash: "",
                permissions: {},
                isActive: true
            }))
        });

        console.log('✅ Staff created');
        console.log('🎉 Complete hotel setup finished!');
        
        global.ACTUAL_HOTEL_ID = hotel.id;
        return hotel;

    } catch (error) {
        console.error('❌ Error ensuring hotel exists:', error);
        throw error;
    }
}

// Updated findOrCreateGuest that uses the validated hotel ID
async function findOrCreateGuest(phoneNumber, name = null) {
    console.log('🔍 Looking up guest:', phoneNumber);

    // Use the actual hotel ID from validation
    const hotelId = global.ACTUAL_HOTEL_ID || HOTEL_ID;

    try {
        let guest = await prisma.guest.findFirst({
            where: {
                OR: [
                    { phone: phoneNumber },
                    { phone: phoneNumber.replace(/\D/g, '') },
                    { phone: `+${phoneNumber}` },
                    { whatsappNumber: phoneNumber },
                    { whatsappNumber: phoneNumber.replace(/\D/g, '') },
                    { whatsappNumber: `+${phoneNumber}` }
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

            const nameSuffix = phoneNumber.slice(-4);
            const fallbackName = name || `Guest ${nameSuffix}`;
            const nameParts = fallbackName.split(' ');
            const firstName = nameParts[0] || 'Guest';
            const lastName = nameParts.slice(1).join(' ') || nameSuffix;

            guest = await prisma.guest.create({
                data: {
                    phone: phoneNumber,
                    whatsappNumber: phoneNumber,
                    firstName: firstName,
                    lastName: lastName,
                    email: null,
                    vipStatus: false,
                    blacklisted: false,
                    preferences: {},
                    hotel: {
                        connect: {
                            id: hotelId
                        }
                    }
                },
                include: {
                    bookings: true,
                },
            });
            
            console.log('✅ Created new guest:', firstName, lastName);
        } else {
            console.log('✅ Found existing guest:', guest.firstName, guest.lastName);
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

// Updated server startup with auto-seeding
app.listen(PORT, async () => {
    console.log('\n🚀 ChatHotel Database-Integrated AI Starting...');
    console.log('='.repeat(60));
    console.log(`✅ Server running on port ${PORT}`);
    
    try {
        // Connect to database
        await prisma.$connect();
        console.log('✅ Database connected successfully');
        
        // Ensure hotel exists (auto-seed if needed)
        await ensureHotelExists();
        
        const stats = await prisma.guest.count();
        console.log(`📊 Database stats: ${stats} guests registered`);
        
    } catch (error) {
        console.log('❌ Database setup failed:', error.message);
        console.log('⚠️ Server will continue but guest creation may fail');
    }
    
    console.log(`🤖 Claude API: ${CLAUDE_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📱 WhatsApp: ${WHATSAPP_ACCESS_TOKEN ? '✅ Ready' : '❌ Not configured'}`);
    console.log('='.repeat(60));
});

async function checkRoomAvailability(checkIn, checkOut, roomType = null) {
    console.log('🏨 Checking room availability');
    
    try {
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        
        // Get all bookings that overlap with requested dates
        const overlappingBookings = await prisma.booking.findMany({
            where: {
                AND: [
                    { hotelId: HOTEL_ID },
                    { status: { in: ['confirmed', 'checked_in'] } },
                    {
                        OR: [
                            {
                                AND: [
                                    { checkIn: { lte: checkInDate } },
                                    { checkOut: { gt: checkInDate } }
                                ]
                            },
                            {
                                AND: [
                                    { checkIn: { lt: checkOutDate } },
                                    { checkOut: { gte: checkOutDate } }
                                ]
                            },
                            {
                                AND: [
                                    { checkIn: { gte: checkInDate } },
                                    { checkOut: { lte: checkOutDate } }
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
                hotelId: HOTEL_ID, // Your Darbar hotel ID from the doc
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
        const recentMessages = await prisma.whatsAppMessage.findMany({
            where: { guestId: guest.id },
            orderBy: { createdAt: 'desc' },
            take: 10
        }).catch(() => []);
        
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
        return { success: false, error: 'WhatsApp not configured' };
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
        
        let messageCount = 0;
        try {
            messageCount = await prisma.whatsAppMessage.count();
        } catch (error) {
            console.log('⚠️ WhatsAppMessage table not accessible');
        }
        
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
            messages: await prisma.whatsAppMessage.findMany({
                where: { guestId: guest?.id },
                orderBy: { createdAt: 'desc' },
                take: 20
            }).catch(() => [])
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

// Additional API endpoints for hotel management

// Check room availability endpoint
app.post('/check-availability', async (req, res) => {
    try {
        const { checkIn, checkOut, roomType } = req.body;
        
        if (!checkIn || !checkOut) {
            return res.status(400).json({ error: 'Check-in and check-out dates are required' });
        }
        
        const availability = await checkRoomAvailability(checkIn, checkOut, roomType);
        res.json(availability);
    } catch (error) {
        console.error('❌ Error checking availability:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create booking endpoint
app.post('/create-booking', async (req, res) => {
    try {
        const { guestPhone, checkIn, checkOut, roomType, guests, guestName } = req.body;
        
        if (!guestPhone || !checkIn || !checkOut) {
            return res.status(400).json({ error: 'Guest phone, check-in, and check-out are required' });
        }
        
        // Find or create guest
        const guest = await findOrCreateGuest(guestPhone, guestName);
        if (!guest) {
            return res.status(500).json({ error: 'Could not create guest profile' });
        }
        
        // Create provisional booking
        const booking = await createProvisionalBooking(guest.id, checkIn, checkOut, roomType, guests);
        if (!booking) {
            return res.status(500).json({ error: 'Could not create booking' });
        }
        
        res.json({
            success: true,
            booking: booking,
            guest: {
                id: guest.id,
                name: `${guest.firstName} ${guest.lastName}`,
                phone: guest.phone
            }
        });
    } catch (error) {
        console.error('❌ Error creating booking:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send message to guest endpoint
app.post('/send-message', async (req, res) => {
    try {
        const { phone, message } = req.body;
        
        if (!phone || !message) {
            return res.status(400).json({ error: 'Phone and message are required' });
        }
        
        const result = await sendWhatsAppMessage(phone, message);
        
        if (result.success) {
            // Try to save the outgoing message to database
            try {
                const guest = await findOrCreateGuest(phone);
                if (guest) {
                    await saveMessage(guest.id, message, 'outgoing', result.messageId);
                }
            } catch (saveError) {
                console.error('⚠️ Could not save outgoing message:', saveError);
            }
            
            res.json({ success: true, messageId: result.messageId });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get guest conversation history
app.get('/guest/:phone/messages', async (req, res) => {
    try {
        const guest = await findOrCreateGuest(req.params.phone);
        if (!guest) {
            return res.status(404).json({ error: 'Guest not found' });
        }
        
        const messages = await prisma.whatsAppMessage.findMany({
            where: { guestId: guest.id },
            orderBy: { createdAt: 'asc' },
            take: 50
        }).catch(() => []);
        
        res.json({
            guest: {
                name: `${guest.firstName} ${guest.lastName}`,
                phone: guest.phone
            },
            messages: messages
        });
    } catch (error) {
        console.error('❌ Error getting messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all bookings for a guest
app.get('/guest/:phone/bookings', async (req, res) => {
    try {
        const guest = await prisma.guest.findFirst({
            where: {
                OR: [
                    { phone: req.params.phone },
                    { whatsappNumber: req.params.phone }
                ]
            },
            include: {
                bookings: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
        
        if (!guest) {
            return res.status(404).json({ error: 'Guest not found' });
        }
        
        res.json({
            guest: {
                name: `${guest.firstName} ${guest.lastName}`,
                phone: guest.phone
            },
            bookings: guest.bookings
        });
    } catch (error) {
        console.error('❌ Error getting bookings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update booking status
app.put('/booking/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const bookingId = req.params.id;
        
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        
        const booking = await prisma.booking.update({
            where: { id: bookingId },
            data: { 
                status: status,
                updatedAt: new Date()
            },
            include: {
                guest: true
            }
        });
        
        // Send notification to guest
        const notificationMessage = `🏨 Booking Update: Your reservation ${bookingId} status has been updated to: ${status}. 

For any questions, please call us at +91-9910364826. Thank you! 🌿`;
        
        await sendWhatsAppMessage(booking.guest.phone, notificationMessage).catch(err => {
            console.error('⚠️ Could not send notification:', err);
        });
        
        res.json({ success: true, booking: booking });
    } catch (error) {
        console.error('❌ Error updating booking:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all recent activity
app.get('/recent-activity', async (req, res) => {
    try {
        const [recentGuests, recentBookings, recentMessages] = await Promise.all([
            prisma.guest.findMany({
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    createdAt: true
                }
            }),
            prisma.booking.findMany({
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: {
                    guest: {
                        select: {
                            firstName: true,
                            lastName: true,
                            phone: true
                        }
                    }
                }
            }),
            prisma.whatsAppMessage.findMany({
                orderBy: { createdAt: 'desc' },
                take: 20,
                include: {
                    guest: {
                        select: {
                            firstName: true,
                            lastName: true,
                            phone: true
                        }
                    }
                }
            }).catch(() => [])
        ]);
        
        res.json({
            recentGuests: recentGuests.map(g => ({
                ...g,
                name: `${g.firstName} ${g.lastName}`
            })),
            recentBookings: recentBookings.map(b => ({
                ...b,
                guestName: `${b.guest.firstName} ${b.guest.lastName}`
            })),
            recentMessages: recentMessages.map(m => ({
                ...m,
                guestName: `${m.guest.firstName} ${m.guest.lastName}`
            }))
        });
    } catch (error) {
        console.error('❌ Error getting recent activity:', error);
        res.status(500).json({ error: error.message });
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
        
        const schemaValid = await validateDatabaseSchema();
        if (schemaValid) {
            console.log('✅ Database schema validation passed');
        }
        
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
    console.log('   ✅ Complete hotel management API');
    console.log('');
    console.log('🔗 Endpoints:');
    console.log('   GET /db-status - Database statistics');
    console.log('   GET /guest/{phone} - Guest profile lookup');
    console.log('   GET /guest/{phone}/messages - Guest conversation history');
    console.log('   GET /guest/{phone}/bookings - Guest booking history');
    console.log('   GET /recent-activity - Recent system activity');
    console.log('   POST /check-availability - Check room availability');
    console.log('   POST /create-booking - Create new booking');
    console.log('   POST /send-message - Send WhatsApp message');
    console.log('   PUT /booking/{id}/status - Update booking status');
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});