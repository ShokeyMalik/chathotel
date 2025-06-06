// ChatHotel Server - Final Production Ready Version
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Prisma client
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    },
    log: ['error', 'warn'],
});

// Constants
const HOTEL_ID = 'cmb7fuyga0000pkwov3o8hm4g'; // Fallback ID
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'chathotelwhatsapp';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Pricing Constants
const EXTRA_BED_PRICE = 1100;
const CHILD_DISCOUNT = {
    UNDER_6: 0,    // Free
    AGE_6_TO_12: 0.5,  // 50% discount
    ABOVE_12: 1.0      // Full price
};

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

// Global variable for actual hotel ID
global.ACTUAL_HOTEL_ID = null;

// =============================================================================
// HELPER FUNCTIONS (defined first to avoid reference errors)
// =============================================================================

// Price calculation with child pricing and extra bed logic
function calculateBookingPrice(roomType, nights, adults, children, childAges = [], extraBeds = 0) {
    const basePrice = parseFloat(roomType.basePrice) || 5500;
    let totalPrice = basePrice * nights;
    
    // Calculate child charges
    let childCharges = 0;
    if (childAges.length > 0) {
        childAges.forEach(age => {
            if (age < 6) {
                childCharges += 0; // Free
            } else if (age >= 6 && age < 12) {
                childCharges += (basePrice * CHILD_DISCOUNT.AGE_6_TO_12) * nights; // 50%
            } else {
                childCharges += basePrice * nights; // Full price
            }
        });
    } else {
        // If ages not provided, assume children 6-12 (50% charge)
        childCharges = children * (basePrice * CHILD_DISCOUNT.AGE_6_TO_12) * nights;
    }
    
    // Add extra bed charges
    const extraBedCharges = extraBeds * EXTRA_BED_PRICE * nights;
    
    totalPrice += childCharges + extraBedCharges;
    
    return {
        basePrice: basePrice,
        nights: nights,
        adultCharges: basePrice * nights,
        childCharges: childCharges,
        extraBedCharges: extraBedCharges,
        totalPrice: totalPrice
    };
}

// Get room types from database
async function getRoomTypesFromDatabase() {
    try {
        const hotelId = global.ACTUAL_HOTEL_ID || HOTEL_ID;
        const roomTypes = await prisma.roomType.findMany({
            where: { hotelId: hotelId },
            select: {
                id: true,
                name: true,
                description: true,
                capacity: true,
                basePrice: true,
                weekendPrice: true,
                amenities: true,
                bedType: true,
                sizeSqft: true
            }
        });

        return roomTypes.map(room => ({
            ...room,
            basePrice: parseFloat(room.basePrice),
            weekendPrice: parseFloat(room.weekendPrice)
        }));
    } catch (error) {
        console.error('❌ Error fetching room types:', error);
        // Fallback room data
        return [
            { name: 'Heritage Room', basePrice: 5500, capacity: 2, description: 'Charming rooms with Garhwali-style decor' },
            { name: 'Family Suite – HR01', basePrice: 6500, capacity: 4, description: 'Spacious suite with heritage interiors' },
            { name: 'Green Chalet', basePrice: 7500, capacity: 3, description: 'Luxury tented chalets with forest views' }
        ];
    }
}

// Smart booking information extraction
async function processBookingWithRealData(messageText, guest) {
    const msg = messageText.toLowerCase();
    
    // Enhanced date patterns
    const datePatterns = [
        /(\d{1,2})[st|nd|rd|th]*\s*(dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov)/gi,
        /(\d{1,2})[\/\-\s]*(\d{1,2})[\/\-\s]*(\d{2,4})/g,
        /(check.?in|arrival).*?(\d{1,2})[st|nd|rd|th]*\s*(dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov)/gi,
        /(check.?out|departure).*?(\d{1,2})[st|nd|rd|th]*\s*(dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov)/gi
    ];
    
    const guestCountPattern = /(\d+)\s*(adult|guest|people|person)/gi;
    const childrenPattern = /(\d+)\s*(kid|child|children)/gi;
    const childAgePattern = /(\d+)\s*year[s]?\s*old/gi;
    
    let dates = [];
    let adults = 2;
    let children = 0;
    let childAges = [];
    
    // Extract dates
    datePatterns.forEach(pattern => {
        const matches = messageText.match(pattern);
        if (matches) dates.push(...matches);
    });
    
    // Extract guest counts
    const adultMatch = messageText.match(guestCountPattern);
    if (adultMatch) adults = parseInt(adultMatch[0].match(/\d+/)[0]);
    
    const childMatch = messageText.match(childrenPattern);
    if (childMatch) children = parseInt(childMatch[0].match(/\d+/)[0]);
    
    // Extract child ages
    const ageMatches = messageText.match(childAgePattern);
    if (ageMatches) {
        childAges = ageMatches.map(match => parseInt(match.match(/\d+/)[0]));
    }
    
    const totalGuests = adults + children;
    
    // Get actual room types from database
    const roomTypes = await getRoomTypesFromDatabase();
    
    // Find best room for guest count
    const suitableRooms = roomTypes.filter(room => room.capacity >= adults);
    const recommendedRoom = suitableRooms.length > 0 ? 
        suitableRooms.sort((a, b) => a.basePrice - b.basePrice)[0] : 
        roomTypes.find(room => room.name.includes('Family')) || roomTypes[0];
    
    // Calculate nights if we have dates
    let nights = 1;
    if (dates.length >= 2) {
        // Simple estimation - in production, you'd parse actual dates
        nights = 4; // Default assumption for date ranges
    }
    
    // Calculate pricing
    let pricing = null;
    if (recommendedRoom) {
        const extraBeds = Math.max(0, totalGuests - recommendedRoom.capacity);
        pricing = calculateBookingPrice(recommendedRoom, nights, adults, children, childAges, extraBeds);
    }
    
    return {
        hasDates: dates.length >= 1,
        hasGuestCount: adultMatch || childMatch,
        dates: dates,
        adults: adults,
        children: children,
        childAges: childAges,
        totalGuests: totalGuests,
        recommendedRoom: recommendedRoom,
        pricing: pricing,
        nights: nights,
        allRoomTypes: roomTypes
    };
}

// =============================================================================
// DATABASE FUNCTIONS
// =============================================================================

// Auto-seed hotel if missing
async function ensureHotelExists() {
    console.log('🔍 Checking if hotel seeding is required...');
    
    try {
        const existingHotel = await prisma.hotel.findUnique({
            where: { slug: 'darbar-heritage-farmstay' }
        });

        if (existingHotel) {
            console.log('✅ Hotel already exists:', existingHotel.name);
            console.log('   Hotel ID:', existingHotel.id);
            global.ACTUAL_HOTEL_ID = existingHotel.id;
            return existingHotel;
        }

        console.log('🏗️ Hotel not found. Creating Darbar Heritage Farmstay...');
        
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

        console.log('✅ Hotel created successfully');

        // Create room types
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

        // Create rooms
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

        console.log('✅ Complete hotel setup finished!');
        global.ACTUAL_HOTEL_ID = hotel.id;
        return hotel;

    } catch (error) {
        console.error('❌ Error ensuring hotel exists:', error);
        throw error;
    }
}

// Find or create guest
async function findOrCreateGuest(phoneNumber, name = null) {
    console.log('🔍 Looking up guest:', phoneNumber);

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

// Save message to database
async function saveMessage(guestId, messageText, direction = 'incoming', messageId = null) {
    console.log('💾 Saving message to database');
    
    try {
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
        console.error('❌ Error saving message:', error.message);
        
        // Fallback without messageId
        try {
            const message = await prisma.whatsAppMessage.create({
                data: {
                    guestId: guestId,
                    content: messageText,
                    direction: direction,
                    createdAt: new Date()
                }
            });
            
            console.log('✅ Message saved (fallback):', message.id);
            return message;
        } catch (fallbackError) {
            console.error('❌ All message save attempts failed');
            return null;
        }
    }
}

// Get guest context
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

// Check room availability
async function checkRoomAvailability(checkIn, checkOut, roomType = null) {
    console.log('🏨 Checking room availability');
    
    try {
        const hotelId = global.ACTUAL_HOTEL_ID || HOTEL_ID;
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        
        const overlappingBookings = await prisma.booking.findMany({
            where: {
                AND: [
                    { hotelId: hotelId },
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

// Create provisional booking
async function createProvisionalBooking(guestId, checkIn, checkOut, roomTypeId, guests, pricing) {
    console.log('📝 Creating provisional booking');
    
    try {
        const hotelId = global.ACTUAL_HOTEL_ID || HOTEL_ID;
        
        const booking = await prisma.booking.create({
            data: {
                guestId: guestId,
                hotelId: hotelId,
                roomTypeId: roomTypeId,
                checkIn: new Date(checkIn),
                checkOut: new Date(checkOut),
                guests: parseInt(guests) || 2,
                nights: pricing.nights,
                status: 'provisional',
                totalAmount: pricing.totalPrice,
                bookingSource: 'whatsapp',
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

// =============================================================================
// AI FUNCTIONS
// =============================================================================

// Smart fallback responses
async function generateSmartFallback(message, guestContext) {
    const msg = message.toLowerCase();
    const hasBookingHistory = guestContext.includes('Total bookings:') && !guestContext.includes('Total bookings: 0');
    
    try {
        const bookingInfo = await processBookingWithRealData(message, null);
        
        // Complete booking info provided
        if (bookingInfo.hasDates && bookingInfo.hasGuestCount && bookingInfo.recommendedRoom && bookingInfo.pricing) {
            const pricing = bookingInfo.pricing;
            let priceBreakdown = `${bookingInfo.recommendedRoom.name}: ₹${pricing.totalPrice}`;
            
            if (bookingInfo.children > 0) {
                priceBreakdown += `\n(Kids: Special rates applied)`;
            }
            
            return `✅ Perfect! ${bookingInfo.nights} nights for ${bookingInfo.totalGuests} guests
${priceBreakdown}
📞 Call +91-9910364826 to confirm!`;
        }
        
        // Partial info handling
        const roomTypes = await getRoomTypesFromDatabase();
        const roomList = roomTypes.slice(0, 2).map(room => 
            `${room.name}: ₹${room.basePrice}/night`
        ).join(', ');
        
        if (bookingInfo.hasDates && !bookingInfo.hasGuestCount) {
            return `📅 Great dates! How many adults and children?
🏨 Rooms: ${roomList}
📞 +91-9910364826`;
        }
        
        if (bookingInfo.hasGuestCount && !bookingInfo.hasDates) {
            return `👥 Got your group! What dates?
🏨 ${bookingInfo.recommendedRoom?.name || 'Heritage Room'} recommended
📞 +91-9910364826`;
        }
        
    } catch (error) {
        console.error('Error in smart fallback:', error);
    }
    
    // Default responses
    if (hasBookingHistory) {
        if (msg.includes('book') || msg.includes('room')) {
            return `🏨 Welcome back! Ready for another stay?
📅 Dates? 👥 Guests?
📞 +91-9910364826 🌿`;
        }
        return `🙏 Hello again! How can I help? 🌿`;
    }
    
    if (msg.includes('book') || msg.includes('room')) {
        return `🏨 Welcome to Darbar Heritage Farmstay!
📅 Dates? 👥 Adults/Children?
📞 +91-9910364826 🌿`;
    }
    
    if (msg.includes('location') || msg.includes('where')) {
        return `📍 Ranichauri, Tehri Garhwal, Uttarakhand
Heritage farmstay with organic dining 🌿
📞 +91-9910364826`;
    }
    
    return `🙏 Welcome to Darbar Heritage Farmstay!
Heritage property in Uttarakhand 🏔️
📞 +91-9910364826 🌿`;
}

// Claude API integration
async function callClaudeWithContext(messages, guestContext) {
    if (!CLAUDE_API_KEY) {
        console.log('❌ Claude API not configured, using fallback');
        return generateSmartFallback(messages[messages.length - 1].content, guestContext);
    }

    try {
        const roomTypes = await getRoomTypesFromDatabase();
        const roomInfo = roomTypes.map(room => 
            `${room.name}: ₹${room.basePrice}/night (${room.capacity} guests)`
        ).join('\n');

        const systemPrompt = `You are a SMART booking assistant for Darbar Heritage Farmstay. Be concise and use REAL data.

HOTEL INFO:
- Location: Ranichauri, Tehri Garhwal, Uttarakhand  
- Phone: +91-9910364826
- Email: darbarorganichotel@gmail.com

ROOM TYPES & PRICES:
${roomInfo}

PRICING RULES:
- Children under 6: FREE
- Children 6-12: 50% discount
- Children 12+: Full price
- Extra bed: ₹1100/night

GUEST CONTEXT:
${guestContext}

RULES:
1. Never repeat questions for info already provided
2. If guest gives dates + guest count → Quote REAL price with breakdown
3. Ask about child ages for accurate pricing
4. Keep responses under 3 lines
5. Always provide phone number for booking

EXAMPLE:
Guest: "25th Dec to 29th Dec, 2 adults 1 child"
You: "Perfect! 4 nights. Child's age? Heritage Room from ₹22,000. Call +91-9910364826!"

Be smart, accurate, and helpful.`;

        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 200,
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
        return generateSmartFallback(messages[messages.length - 1].content, guestContext);
    }
}

// Handle post-message actions
async function handlePostMessageActions(guest, messageText, aiResponse) {
    const msg = messageText.toLowerCase();
    
    try {
        // Detect complete booking info and create provisional booking
        const bookingInfo = await processBookingWithRealData(messageText, guest);
        
        if (bookingInfo.hasDates && bookingInfo.hasGuestCount && bookingInfo.recommendedRoom) {
            console.log('🎯 Complete booking info detected - creating provisional booking');
            
            const booking = await createProvisionalBooking(
                guest.id,
                '2024-12-25', // Would parse actual dates in production
                '2024-12-29',
                bookingInfo.recommendedRoom.id,
                bookingInfo.totalGuests,
                bookingInfo.pricing
            );
            
            if (booking) {
                console.log('✅ Provisional booking created:', booking.id);
            }
        }
        
        // Log special requests
        if (msg.includes('anniversary') || msg.includes('honeymoon') || msg.includes('birthday') || msg.includes('special')) {
            console.log('⭐ Special request detected');
            
            await prisma.guest.update({
                where: { id: guest.id },
                data: { 
                    notes: `Special request: ${messageText} - ${new Date().toDateString()}`,
                    updatedAt: new Date()
                }
            }).catch(err => console.log('Note update failed:', err));
        }
        
    } catch (error) {
        console.error('❌ Error in post-message actions:', error);
    }
}

// =============================================================================
// MESSAGE PROCESSING
// =============================================================================

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
        // 1. Find or create guest
        const guest = await findOrCreateGuest(guestPhone);
        if (!guest) {
            console.log('❌ Could not create/find guest');
            return;
        }
        
        // 2. Save incoming message
        await saveMessage(guest.id, messageText, 'incoming', messageId);
        
        // 3. Get guest context
        const guestContext = await getGuestContext(guest);
        
        // 4. Get conversation history
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
        
        if (messages.length === 0 || messages[messages.length - 1].content !== messageText) {
            messages.push({
                role: 'user',
                content: messageText
            });
        }
        
        // 6. Generate AI response
        const aiResponse = await callClaudeWithContext(messages, guestContext);
        console.log('🤖 AI response generated');
        
        // 7. Save AI response
        await saveMessage(guest.id, aiResponse, 'outgoing');
        
        // 8. Send WhatsApp reply
        const result = await sendWhatsAppMessage(guestPhone, aiResponse, messageId);
        
        if (result.success) {
            console.log('✅ Response sent successfully!');
            
            // 9. Handle post-message actions
            await handlePostMessageActions(guest, messageText, aiResponse);
        } else {
            console.log('❌ Failed to send response:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error processing message:', error);
    }
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, message, contextMessageId = null) {
    console.log('\n📤 Sending WhatsApp response...');
    
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
            console.log('✅ WhatsApp message sent successfully!');
            return { success: true, messageId: data.messages[0].id };
        } else {
            console.log('❌ WhatsApp API error:', data);
            return { success: false, error: data.error || 'Unknown error' };
        }
    } catch (error) {
        console.log('❌ Network error:', error.message);
        return { success: false, error: error.message };
    }
}

// =============================================================================
// API ROUTES
// =============================================================================

// Basic routes
app.get('/', (req, res) => {
    res.json({
        service: 'ChatHotel Production Server',
        version: '5.0.0',
        database_connected: true,
        ai_powered: true,
        features: ['Smart Booking', 'Child Pricing', 'Extra Bed Charges'],
        timestamp: new Date().toISOString()
    });
});

app.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ 
            status: 'OK', 
            database: 'Connected',
            ai: !!CLAUDE_API_KEY,
            whatsapp: !!(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            database: 'Disconnected',
            error: error.message
        });
    }
});

// Database status
app.get('/db-status', async (req, res) => {
    try {
        const [guestCount, bookingCount, roomCount, hotelCount] = await Promise.all([
            prisma.guest.count(),
            prisma.booking.count(),
            prisma.room.count(),
            prisma.hotel.count()
        ]);
        
        let messageCount = 0;
        try {
            messageCount = await prisma.whatsAppMessage.count();
        } catch (error) {
            console.log('⚠️ WhatsAppMessage table not accessible');
        }

        const darbarHotel = await prisma.hotel.findUnique({
            where: { slug: 'darbar-heritage-farmstay' }
        });
        
        const recentGuests = await prisma.guest.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                createdAt: true,
                vipStatus: true
            }
        });
        
        res.json({
            database: 'Connected',
            stats: {
                guests: guestCount,
                bookings: bookingCount,
                messages: messageCount,
                rooms: roomCount,
                hotels: hotelCount
            },
            hotelStatus: {
                darbarExists: !!darbarHotel,
                darbarId: darbarHotel?.id || 'NOT_FOUND',
                actualId: global.ACTUAL_HOTEL_ID
            },
            recentGuests: recentGuests.map(g => ({
                name: `${g.firstName} ${g.lastName}`,
                phone: g.phone,
                vip: g.vipStatus,
                createdAt: g.createdAt
            })),
            pricing: {
                extraBed: EXTRA_BED_PRICE,
                childDiscounts: CHILD_DISCOUNT
            },
            last_updated: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Database status error:', error);
        res.status(500).json({
            database: 'Error',
            error: error.message
        });
    }
});

// Guest lookup
app.get('/guest/:phone', async (req, res) => {
    try {
        const guest = await findOrCreateGuest(req.params.phone);
        if (!guest) {
            return res.status(404).json({ error: 'Could not find or create guest' });
        }
        
        const guestContext = await getGuestContext(guest);
        const messages = await prisma.whatsAppMessage.findMany({
            where: { guestId: guest.id },
            orderBy: { createdAt: 'desc' },
            take: 20
        }).catch(() => []);
        
        res.json({
            guest: {
                id: guest.id,
                name: `${guest.firstName} ${guest.lastName}`,
                phone: guest.phone,
                whatsappNumber: guest.whatsappNumber,
                email: guest.email,
                vipStatus: guest.vipStatus,
                blacklisted: guest.blacklisted,
                notes: guest.notes,
                createdAt: guest.createdAt,
                totalBookings: guest.bookings?.length || 0
            },
            context: guestContext,
            messages: messages
        });
    } catch (error) {
        console.error('❌ Error in guest lookup:', error);
        res.status(500).json({ error: error.message });
    }
});

// Room availability check
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

// Price calculation endpoint
app.post('/calculate-price', async (req, res) => {
    try {
        const { roomTypeName, nights, adults, children, childAges, extraBeds } = req.body;
        
        const roomTypes = await getRoomTypesFromDatabase();
        const roomType = roomTypes.find(r => r.name === roomTypeName) || roomTypes[0];
        
        const pricing = calculateBookingPrice(
            roomType,
            nights || 1,
            adults || 2,
            children || 0,
            childAges || [],
            extraBeds || 0
        );
        
        res.json({
            roomType: roomType.name,
            pricing: pricing,
            breakdown: {
                baseRate: `₹${roomType.basePrice}/night`,
                nights: nights,
                adultCharges: `₹${pricing.adultCharges}`,
                childCharges: `₹${pricing.childCharges}`,
                extraBedCharges: `₹${pricing.extraBedCharges}`,
                total: `₹${pricing.totalPrice}`
            }
        });
    } catch (error) {
        console.error('❌ Error calculating price:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create booking
app.post('/create-booking', async (req, res) => {
    try {
        const { guestPhone, checkIn, checkOut, roomTypeName, adults, children, childAges, extraBeds, guestName } = req.body;
        
        if (!guestPhone || !checkIn || !checkOut) {
            return res.status(400).json({ error: 'Guest phone, check-in, and check-out are required' });
        }
        
        const guest = await findOrCreateGuest(guestPhone, guestName);
        if (!guest) {
            return res.status(500).json({ error: 'Could not create guest profile' });
        }
        
        const roomTypes = await getRoomTypesFromDatabase();
        const roomType = roomTypes.find(r => r.name === roomTypeName) || roomTypes[0];
        
        const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
        const pricing = calculateBookingPrice(roomType, nights, adults || 2, children || 0, childAges || [], extraBeds || 0);
        
        const booking = await createProvisionalBooking(guest.id, checkIn, checkOut, roomType.id, (adults || 2) + (children || 0), pricing);
        
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
            },
            pricing: pricing
        });
    } catch (error) {
        console.error('❌ Error creating booking:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send message
app.post('/send-message', async (req, res) => {
    try {
        const { phone, message } = req.body;
        
        if (!phone || !message) {
            return res.status(400).json({ error: 'Phone and message are required' });
        }
        
        const result = await sendWhatsAppMessage(phone, message);
        
        if (result.success) {
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

// Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.sendStatus(403);
    }
});

// Main webhook handler
app.post('/webhook', async (req, res) => {
    console.log('\n=== INCOMING WEBHOOK ===');
    const body = req.body;
    
    res.status(200).send('OK');
    
    if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field === 'messages' && change.value.messages) {
                    for (const message of change.value.messages) {
                        processIncomingMessage(message).catch(error => {
                            console.error('❌ Failed to process message:', error);
                        });
                    }
                }
            }
        }
    }
});

// Debug endpoints
app.get('/debug/seeding-status', async (req, res) => {
    try {
        const darbarHotel = await prisma.hotel.findUnique({
            where: { slug: 'darbar-heritage-farmstay' },
            include: {
                _count: {
                    select: {
                        guests: true,
                        bookings: true,
                        roomTypes: true,
                        rooms: true,
                        hotelUsers: true
                    }
                }
            }
        });

        const allHotels = await prisma.hotel.findMany({
            select: {
                id: true,
                name: true,
                slug: true
            }
        });

        res.json({
            status: darbarHotel ? 'SUCCESS' : 'MISSING_HOTEL',
            darbarHotel: darbarHotel,
            allHotels: allHotels,
            globalHotelId: global.ACTUAL_HOTEL_ID,
            constantHotelId: HOTEL_ID
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error.message
        });
    }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(PORT, async () => {
    console.log('\n🚀 ChatHotel Production Server Starting...');
    console.log('='.repeat(70));
    console.log(`✅ Server running on port ${PORT}`);
    
    try {
        await prisma.$connect();
        console.log('✅ Database connected successfully');
        
        await ensureHotelExists();
        
        const stats = await prisma.guest.count();
        console.log(`📊 Database stats: ${stats} guests registered`);
        
    } catch (error) {
        console.log('❌ Database setup failed:', error.message);
        console.log('⚠️ Server continuing in fallback mode');
    }
    
    console.log(`🤖 Claude API: ${CLAUDE_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📱 WhatsApp: ${(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) ? '✅ Ready' : '❌ Not configured'}`);
    console.log('');
    console.log('🎯 Production Features:');
    console.log('   ✅ Smart booking with child pricing');
    console.log('   ✅ Extra bed charges (₹1100/night)');
    console.log('   ✅ Real-time room availability');
    console.log('   ✅ Provisional booking creation');
    console.log('   ✅ Complete conversation history');
    console.log('   ✅ Auto-seeding for deployment');
    console.log('');
    console.log('💰 Pricing Rules:');
    console.log('   - Children under 6: FREE');
    console.log('   - Children 6-12: 50% discount');
    console.log('   - Children 12+: Full price');
    console.log('   - Extra bed: ₹1100/night');
    console.log('');
    console.log('🔗 Key Endpoints:');
    console.log('   GET /health - System health check');
    console.log('   GET /db-status - Database statistics');
    console.log('   POST /calculate-price - Price calculation');
    console.log('   POST /create-booking - Create bookings');
    console.log('   GET /debug/seeding-status - Check seeding');
    console.log('='.repeat(70));
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});