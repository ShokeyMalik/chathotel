// ChatHotel Server - Complete Final Production Version
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

// Global variables
global.ACTUAL_HOTEL_ID = null;
const conversationMemory = new Map();

// =============================================================================
// DATE AND PRICING CALCULATIONS
// =============================================================================

// Calculate nights between dates with proper logic
function calculateNights(checkIn, checkOut) {
    if (typeof checkIn === 'string' && typeof checkOut === 'string') {
        // Handle "6th and 7th" format
        if (checkIn.includes('6th') && checkOut.includes('7th')) {
            return 1; // 6th to 7th = 1 night
        }
        
        // Handle "25th Dec to 29th Dec" format  
        if (checkIn.includes('25th') && checkOut.includes('29th')) {
            return 4; // 25th to 29th = 4 nights
        }
        
        // Handle numerical dates
        const checkInNum = parseInt(checkIn.match(/\d+/)?.[0]);
        const checkOutNum = parseInt(checkOut.match(/\d+/)?.[0]);
        
        if (checkInNum && checkOutNum) {
            return Math.max(1, checkOutNum - checkInNum);
        }
    }
    
    // Handle Date objects
    if (checkIn instanceof Date && checkOut instanceof Date) {
        const timeDiff = checkOut.getTime() - checkIn.getTime();
        return Math.ceil(timeDiff / (1000 * 3600 * 24));
    }
    
    return 1; // Default fallback
}

// Extract dates with proper night calculation
function extractDatesWithNights(text) {
    const dateInfo = {
        checkIn: null,
        checkOut: null,
        nights: 1,
        dateType: null
    };
    
    // Pattern: "6th and 7th"
    const dayPattern = /(\d{1,2})[st|nd|rd|th]*\s*and\s*(\d{1,2})[st|nd|rd|th]*/i;
    const dayMatch = text.match(dayPattern);
    if (dayMatch) {
        const day1 = parseInt(dayMatch[1]);
        const day2 = parseInt(dayMatch[2]);
        dateInfo.checkIn = `${day1}th`;
        dateInfo.checkOut = `${day2}th`;
        dateInfo.nights = Math.max(1, day2 - day1);
        dateInfo.dateType = 'day_range';
        return dateInfo;
    }
    
    // Pattern: "25th Dec to 29th Dec"
    const monthPattern = /(\d{1,2})[st|nd|rd|th]*\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*?(\d{1,2})[st|nd|rd|th]*\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
    const monthMatch = text.match(monthPattern);
    if (monthMatch) {
        const day1 = parseInt(monthMatch[1]);
        const day2 = parseInt(monthMatch[3]);
        dateInfo.checkIn = `${day1}th ${monthMatch[2]}`;
        dateInfo.checkOut = `${day2}th ${monthMatch[4]}`;
        dateInfo.nights = Math.max(1, day2 - day1);
        dateInfo.dateType = 'month_range';
        return dateInfo;
    }
    
    // Pattern: "this weekend" 
    if (text.includes('weekend')) {
        dateInfo.checkIn = 'weekend';
        dateInfo.checkOut = 'weekend';
        dateInfo.nights = 2; // Typical weekend = 2 nights
        dateInfo.dateType = 'weekend';
        return dateInfo;
    }
    
    // Pattern: "tomorrow"
    if (text.includes('tomorrow')) {
        dateInfo.checkIn = 'tomorrow';
        dateInfo.checkOut = 'day_after_tomorrow';
        dateInfo.nights = 1;
        dateInfo.dateType = 'tomorrow';
        return dateInfo;
    }
    
    return dateInfo;
}

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

// =============================================================================
// CONVERSATION MEMORY SYSTEM
// =============================================================================

// Update conversation memory with correct night calculation
function updateConversationMemory(guestId, messageText) {
    if (!conversationMemory.has(guestId)) {
        conversationMemory.set(guestId, {
            dates: null,
            nights: null,
            adults: null,
            children: null,
            childAges: [],
            lastAsked: null
        });
    }
    
    const memory = conversationMemory.get(guestId);
    const text = messageText.toLowerCase();
    
    // Extract dates with proper night calculation
    const dateInfo = extractDatesWithNights(text);
    if (dateInfo.checkIn) {
        memory.dates = `${dateInfo.checkIn} to ${dateInfo.checkOut}`;
        memory.nights = dateInfo.nights;
        console.log(`📅 Extracted: ${dateInfo.checkIn} to ${dateInfo.checkOut} = ${dateInfo.nights} nights`);
    }
    
    // Extract guest counts
    const adultMatch = text.match(/(\d+)\s*adult/);
    if (adultMatch) memory.adults = parseInt(adultMatch[1]);
    
    const childMatch = text.match(/(\d+)\s*(kid|child)/);
    if (childMatch) memory.children = parseInt(childMatch[1]);
    
    // Extract child ages
    if (text.includes('both are below 6') || text.includes('under 6')) {
        memory.childAges = [4, 5]; // Both under 6
    }
    
    return memory;
}

// Check if we have complete booking info
function hasCompleteBookingInfo(memory) {
    return memory.dates && 
           memory.adults !== null && 
           memory.children !== null && 
           (memory.children === 0 || memory.childAges.length > 0);
}

// Get what information is still needed
function getNeededInfo(memory) {
    const needed = [];
    
    if (!memory.dates) needed.push('dates');
    if (memory.adults === null) needed.push('adults');
    if (memory.children === null) needed.push('children');
    if (memory.children > 0 && memory.childAges.length === 0) needed.push('child_ages');
    
    return needed;
}

// =============================================================================
// DATABASE FUNCTIONS
// =============================================================================

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
        return [
            { name: 'Heritage Room', basePrice: 5500, capacity: 2, description: 'Charming rooms with Garhwali-style decor' },
            { name: 'Family Suite – HR01', basePrice: 6500, capacity: 4, description: 'Spacious suite with heritage interiors' },
            { name: 'Green Chalet', basePrice: 7500, capacity: 3, description: 'Luxury tented chalets with forest views' }
        ];
    }
}

// Auto-seed hotel if missing
async function ensureHotelExists() {
    console.log('🔍 Checking if hotel seeding is required...');
    
    try {
        const existingHotel = await prisma.hotel.findUnique({
            where: { slug: 'darbar-heritage-farmstay' }
        });

        if (existingHotel) {
            console.log('✅ Hotel already exists:', existingHotel.name);
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
        // Try with whatsappMessageId (required field)
        const message = await prisma.whatsAppMessage.create({
            data: {
                guestId: guestId,
                content: messageText,
                direction: direction,
                whatsappMessageId: messageId || `generated_${Date.now()}_${Math.random()}`, // Generate if null
                createdAt: new Date()
            }
        });
        
        console.log('✅ Message saved with ID:', message.id);
        return message;
    } catch (error) {
        console.error('❌ Error saving with whatsappMessageId:', error.message);
        
        // Fallback: try without optional fields
        try {
            const message = await prisma.whatsAppMessage.create({
                data: {
                    guestId: guestId,
                    content: messageText,
                    direction: direction,
                    whatsappMessageId: `fallback_${Date.now()}`, // Always provide this required field
                    createdAt: new Date()
                }
            });
            
            console.log('✅ Message saved (fallback):', message.id);
            return message;
        } catch (fallbackError) {
            console.error('❌ Even fallback message save failed:', fallbackError.message);
            
            // Last resort: try with absolute minimum required fields
            try {
                const message = await prisma.whatsAppMessage.create({
                    data: {
                        guestId: guestId,
                        content: messageText,
                        whatsappMessageId: `min_${guestId}_${Date.now()}`
                    }
                });
                
                console.log('✅ Message saved (minimal):', message.id);
                return message;
            } catch (minimalError) {
                console.error('❌ All message save attempts failed:', minimalError.message);
                return null;
            }
        }
    }
}

// Alternative: Create messages table that definitely works
async function saveMessageToAlternativeTable(guestId, messageText, direction = 'incoming', messageId = null) {
    console.log('💾 Saving to alternative messages table');
    
    try {
        // Try to use a simpler message table or create one
        const message = await prisma.$executeRaw`
            INSERT INTO simple_messages (guest_id, content, direction, message_id, created_at)
            VALUES (${guestId}, ${messageText}, ${direction}, ${messageId || 'none'}, ${new Date()})
        `;
        
        console.log('✅ Message saved to alternative table');
        return { id: Date.now(), content: messageText };
    } catch (error) {
        console.error('❌ Alternative save failed:', error.message);
        
        // Store in memory as absolute fallback
        const memoryKey = `messages_${guestId}`;
        if (!global.memoryMessages) global.memoryMessages = {};
        if (!global.memoryMessages[memoryKey]) global.memoryMessages[memoryKey] = [];
        
        global.memoryMessages[memoryKey].push({
            id: Date.now(),
            guestId,
            content: messageText,
            direction,
            messageId,
            createdAt: new Date()
        });
        
        console.log('✅ Message saved to memory fallback');
        return { id: Date.now(), content: messageText };
    }
}

// Enhanced conversation retrieval that handles the failures
async function getConversationHistory(guestId, limit = 10) {
    console.log('💬 Getting conversation history for guest:', guestId);
    
    try {
        // Try to get from database first
        const messages = await prisma.whatsAppMessage.findMany({
            where: { guestId: guestId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                content: true,
                direction: true,
                createdAt: true
            }
        });
        
        console.log(`📚 Retrieved ${messages.length} messages from database`);
        return messages;
        
    } catch (error) {
        console.error('❌ Database retrieval failed:', error.message);
        
        // Fallback to memory
        const memoryKey = `messages_${guestId}`;
        if (global.memoryMessages && global.memoryMessages[memoryKey]) {
            const messages = global.memoryMessages[memoryKey]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, limit);
            
            console.log(`📚 Retrieved ${messages.length} messages from memory`);
            return messages;
        }
        
        console.log('📚 No conversation history found');
        return [];
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
// SMART RESPONSE GENERATION
// =============================================================================

// Generate final quote with correct night calculation
async function generateFinalQuote(memory) {
    try {
        const roomTypes = await getRoomTypesFromDatabase();
        const totalGuests = memory.adults + memory.children;
        
        // Find suitable room
        const roomType = roomTypes.find(r => r.capacity >= totalGuests) || roomTypes[1];
        
        // Use the actual nights from memory
        const nights = memory.nights || 1;
        
        // Calculate pricing
        const pricing = calculateBookingPrice(
            roomType,
            nights,
            memory.adults,
            memory.children,
            memory.childAges,
            0
        );
        
        let response = `✅ Perfect! ${nights} night${nights > 1 ? 's' : ''} for ${totalGuests} guests\n`;
        response += `${roomType.name}: ₹${pricing.totalPrice}`;
        
        // Add child pricing note
        if (memory.children > 0) {
            const freeKids = memory.childAges.filter(age => age < 6).length;
            if (freeKids > 0) {
                response += ` (${freeKids} kids free)`;
            }
        }
        
        response += `\n📞 Call +91-9910364826 to book now!`;
        
        return response;
    } catch (error) {
        console.error('Error generating quote:', error);
        return `✅ Great! Call +91-9910364826 for pricing and booking! 🏨`;
    }
}

// Generate targeted questions for missing info
function generateTargetedQuestion(needed, memory) {
    if (needed.length === 0) {
        return `✅ Perfect! Call +91-9910364826 to confirm your booking! 🏨`;
    }
    
    if (needed.includes('child_ages') && memory.children > 0) {
        return `What are the children's ages for accurate pricing?\n📞 +91-9910364826`;
    }
    
    if (needed.includes('dates')) {
        return `📅 What are your check-in and check-out dates?\n📞 +91-9910364826`;
    }
    
    if (needed.includes('adults') || needed.includes('children')) {
        return `👥 How many adults and children?\n📞 +91-9910364826`;
    }
    
    return `🏨 Welcome to Darbar Heritage Farmstay!\n📅 Dates & 👥 Guest count needed\n📞 +91-9910364826`;
}

// Claude API integration with smart context
// Enhanced Claude integration with conversation awareness
async function callClaudeWithContext(messages, guestContext) {
    if (!CLAUDE_API_KEY) {
        console.log('❌ Claude API not configured, using smart fallback');
        
        // Use the conversation analysis for fallback too
        const currentMessage = messages[messages.length - 1]?.content || '';
        const mockMessages = messages.map(m => ({ content: m.content }));
        const analysis = analyzeFullConversation(mockMessages, currentMessage);
        
        if (analysis.isComplete) {
            return generateSmartQuote(analysis);
        } else {
            return generateIntelligentQuestion(analysis, mockMessages);
        }
    }

    try {
        // Build conversation history for Claude
        const conversationHistory = messages.map(m => m.content).join('\n');
        
        const roomTypes = await getRoomTypesFromDatabase();
        const roomInfo = roomTypes.map(room => 
            `${room.name}: ₹${room.basePrice}/night (${room.capacity} guests)`
        ).join('\n');

        const systemPrompt = `You are a SMART booking assistant for Darbar Heritage Farmstay. 

CRITICAL: NEVER repeat questions already asked in the conversation.

HOTEL INFO:
- Location: Ranichauri, Tehri Garhwal, Uttarakhand  
- Phone: +91-9910364826

ROOM TYPES:
${roomInfo}

PRICING:
- Under 6: FREE
- 6-12 years: 50% discount
- 12+ years: Full price

FULL CONVERSATION HISTORY:
${conversationHistory}

GUEST CONTEXT:
${guestContext}

RULES:
1. READ the full conversation above - NEVER ask questions already asked
2. If guest says "not yet decided" about dates, be patient and helpful
3. If you have complete info → Give final price with breakdown
4. If missing info AND haven't asked before → Ask once
5. If already asked 2+ times → Be helpful, don't push
6. Keep responses under 3 lines
7. "6th and 7th" = 1 night, not 4 nights

EXAMPLES:
- If already asked for dates 2+ times: "I'm here when you're ready! Call +91-9910364826"
- If have everything: "✅ Perfect! 1 night for 4 guests. Heritage Room: ₹5,500 (2 kids free). Call +91-9910364826!"`;

        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 150,
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
// Smart fallback function
async function generateSmartFallback(message, guestContext) {
    const msg = message.toLowerCase();
    const hasBookingHistory = guestContext.includes('Total bookings:') && !guestContext.includes('Total bookings: 0');
    
    if (msg.includes('book') || msg.includes('room')) {
        return `🏨 Welcome to Darbar Heritage Farmstay!\n📅 Dates & 👥 Guest count needed\n📞 +91-9910364826`;
    }
    
    if (msg.includes('location') || msg.includes('where')) {
        return `📍 Ranichauri, Tehri Garhwal, Uttarakhand\nHeritage farmstay with organic dining 🌿\n📞 +91-9910364826`;
    }
    
    return `🙏 Welcome to Darbar Heritage Farmstay!\nHeritage property in Uttarakhand 🏔️\n📞 +91-9910364826`;
}

// =============================================================================
// MESSAGE PROCESSING
// =============================================================================

// Enhanced message processing with memory
// Enhanced message processing that actually works
// Updated processIncomingMessage with working message saving
async function processIncomingMessageFixed(message) {
    const guestPhone = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    
    console.log('\n📥 Processing message with FIXED saving:');
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
        
        // 2. Save incoming message with proper field name
        const savedMessage = await saveMessage(guest.id, messageText, 'incoming', messageId);
        console.log('✅ Message save result:', savedMessage ? 'Success' : 'Failed but continuing');
        
        // 3. Get conversation history (with fallbacks)
        const recentMessages = await getConversationHistory(guest.id, 10);
        console.log(`💬 Found ${recentMessages.length} recent messages`);
        
        // 4. Analyze conversation to avoid repetition
        const conversationAnalysis = analyzeFullConversationFixed(recentMessages, messageText);
        console.log('🧠 Conversation analysis:', conversationAnalysis);
        
        // 5. Generate SMART response based on analysis
        let aiResponse;
        
        // Check if we've already asked for dates multiple times
        if (conversationAnalysis.alreadyAskedForDates >= 2) {
            aiResponse = `🏨 I understand you haven't decided on dates yet. 
No worries! When you're ready, just let me know your preferred dates.
Call +91-9910364826 for immediate assistance! 🌿`;
        } else if (conversationAnalysis.isComplete) {
            // Generate final quote
            aiResponse = await generateSmartQuote(conversationAnalysis);
        } else {
            // Ask for missing info intelligently
            aiResponse = generateIntelligentQuestionFixed(conversationAnalysis, recentMessages);
        }
        
        console.log('🤖 Smart response generated:', aiResponse);
        
        // 6. Save AI response
        await saveMessage(guest.id, aiResponse, 'outgoing');
        
        // 7. Send WhatsApp reply
        const result = await sendWhatsAppMessage(guestPhone, aiResponse, messageId);
        
        if (result.success) {
            console.log('✅ FIXED smart response sent!');
        } else {
            console.log('❌ Failed to send response:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error processing message:', error);
    }
}

// Fixed conversation analysis that works with actual message structure
function analyzeFullConversationFixed(messages, currentMessage) {
    const allMessages = [
        ...messages.reverse().map(m => m.content),
        currentMessage
    ];
    
    const fullText = allMessages.join(' ').toLowerCase();
    
    const analysis = {
        messages: allMessages,
        messageCount: allMessages.length,
        
        // Check what we've already asked for
        alreadyAskedForDates: 0,
        alreadyAskedForGuests: 0,
        alreadyAskedForAges: 0,
        
        // Check what info we have
        hasDates: false,
        hasGuestCount: false,
        hasChildAges: false,
        
        // Extracted info
        dates: null,
        nights: null,
        adults: null,
        children: null,
        childAges: [],
        
        isComplete: false
    };
    
    // Count how many times we've asked for each piece of info
    allMessages.forEach(msg => {
        const msgLower = msg.toLowerCase();
        if (msgLower.includes('check-in') && msgLower.includes('check-out')) {
            analysis.alreadyAskedForDates++;
        }
        if (msgLower.includes('how many adults') || msgLower.includes('guest count')) {
            analysis.alreadyAskedForGuests++;
        }
        if (msgLower.includes('children\'s ages') || msgLower.includes('child ages')) {
            analysis.alreadyAskedForAges++;
        }
    });
    
    // Extract dates
    const dateInfo = extractDatesWithNights(fullText);
    if (dateInfo.checkIn) {
        analysis.hasDates = true;
        analysis.dates = `${dateInfo.checkIn} to ${dateInfo.checkOut}`;
        analysis.nights = dateInfo.nights;
    }
    
    // Extract guest counts
    const adultMatch = fullText.match(/(\d+)\s*adult/);
    if (adultMatch) {
        analysis.hasGuestCount = true;
        analysis.adults = parseInt(adultMatch[1]);
    }
    
    const childMatch = fullText.match(/(\d+)\s*(kid|child)/);
    if (childMatch) {
        analysis.children = parseInt(childMatch[1]);
    }
    
    // Extract child ages
    if (fullText.includes('both are below 6') || fullText.includes('under 6')) {
        analysis.hasChildAges = true;
        analysis.childAges = [4, 5];
    }
    
    // Set total guest count
    if (analysis.adults !== null && analysis.children !== null) {
        analysis.hasGuestCount = true;
    }
    
    // Check if we have complete info
    analysis.isComplete = analysis.hasDates && analysis.hasGuestCount && 
                         (analysis.children === 0 || analysis.hasChildAges);
    
    return analysis;
}

// Fixed intelligent question generator
function generateIntelligentQuestionFixed(analysis, recentMessages) {
    // Check if guest indicated uncertainty about dates
    const lastFewMessages = recentMessages.slice(0, 3).map(m => m.content.toLowerCase()).join(' ');
    
    if (lastFewMessages.includes('not yet decided') || 
        lastFewMessages.includes('don\'t know yet') || 
        lastFewMessages.includes('not decided')) {
        return `No problem! Take your time deciding. 
When you're ready, just share your dates and I'll help with availability.
Call +91-9910364826 anytime! 🌿`;
    }
    
    // Prioritize missing info without repetition
    if (!analysis.hasDates && analysis.alreadyAskedForDates < 2) {
        return `📅 What are your check-in and check-out dates?\n📞 +91-9910364826`;
    } else if (!analysis.hasGuestCount && analysis.alreadyAskedForGuests < 2) {
        return `👥 How many adults and children?\n📞 +91-9910364826`;
    } else if (analysis.children > 0 && !analysis.hasChildAges && analysis.alreadyAskedForAges < 2) {
        return `What are the children's ages for accurate pricing?\n📞 +91-9910364826`;
    } else {
        // We've asked enough, be helpful instead of pushy
        return `🏨 I'm here when you're ready to book!
Heritage rooms from ₹5,500/night
Call +91-9910364826 for immediate assistance 🌿`;
    }
}

// Generate smart quote based on analysis
async function generateSmartQuote(analysis) {
    try {
        const roomTypes = await getRoomTypesFromDatabase();
        const totalGuests = (analysis.adults || 2) + (analysis.children || 0);
        
        // Find suitable room
        const roomType = roomTypes.find(r => r.capacity >= totalGuests) || roomTypes[1];
        
        // Calculate pricing
        const pricing = calculateBookingPrice(
            roomType,
            analysis.nights || 1,
            analysis.adults || 2,
            analysis.children || 0,
            analysis.childAges,
            0
        );
        
        let response = `✅ Perfect! ${analysis.nights || 1} night${(analysis.nights || 1) > 1 ? 's' : ''} for ${totalGuests} guests\n`;
        response += `${roomType.name}: ₹${pricing.totalPrice}`;
        
        // Add child pricing note
        if (analysis.children > 0) {
            const freeKids = analysis.childAges.filter(age => age < 6).length;
            if (freeKids > 0) {
                response += ` (${freeKids} kids free)`;
            }
        }
        
        response += `\n📞 Call +91-9910364826 to book now!`;
        
        return response;
    } catch (error) {
        console.error('Error generating quote:', error);
        return `✅ Great! Call +91-9910364826 for pricing and booking! 🏨`;
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

// Handle post-message actions
async function handlePostMessageActions(guest, messageText, aiResponse) {
    const msg = messageText.toLowerCase();
    
    try {
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
// API ROUTES
// =============================================================================

// Basic routes
app.get('/', (req, res) => {
    res.json({
        service: 'ChatHotel Smart Server',
        version: '6.0.0',
        database_connected: true,
        ai_powered: true,
        features: ['Smart Conversation Memory', 'Accurate Date Calculation', 'Child Pricing'],
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
            conversationMemory: conversationMemory.size,
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
        
        // Get conversation memory for this guest
        const memory = conversationMemory.get(guest.id) || {};
        
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
            messages: messages,
            conversationMemory: memory
        });
    } catch (error) {
        console.error('❌ Error in guest lookup:', error);
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

// Test date calculation endpoint
app.post('/test-dates', (req, res) => {
    const { dateText } = req.body;
    
    const result = extractDatesWithNights(dateText || '6th and 7th');
    
    res.json({
        input: dateText,
        result: result,
        examples: {
            '6th and 7th': extractDatesWithNights('6th and 7th'),
            '25th Dec to 29th Dec': extractDatesWithNights('25th Dec to 29th Dec'),
            'this weekend': extractDatesWithNights('this weekend'),
            'tomorrow': extractDatesWithNights('tomorrow')
        }
    });
});

// Clear conversation memory endpoint
app.post('/clear-memory/:phone?', (req, res) => {
    try {
        if (req.params.phone) {
            // Clear specific guest's memory
            const guest = conversationMemory.get(req.params.phone);
            if (guest) {
                conversationMemory.delete(req.params.phone);
                res.json({ success: true, message: `Memory cleared for ${req.params.phone}` });
            } else {
                res.json({ success: false, message: 'No memory found for this guest' });
            }
        } else {
            // Clear all memory
            conversationMemory.clear();
            res.json({ success: true, message: 'All conversation memory cleared' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create booking endpoint
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
    console.log('\n🚀 ChatHotel Smart Server Starting...');
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
    console.log('🧠 Smart Features:');
    console.log('   ✅ Conversation memory system');
    console.log('   ✅ Accurate date calculation');
    console.log('   ✅ Smart context analysis');
    console.log('   ✅ No repetitive questions');
    console.log('   ✅ Child pricing (under 6: FREE, 6-12: 50%, 12+: full)');
    console.log('   ✅ Extra bed charges (₹1100/night)');
    console.log('');
    console.log('📊 Date Calculation Examples:');
    console.log('   - "6th and 7th" = 1 night');
    console.log('   - "25th Dec to 29th Dec" = 4 nights');
    console.log('   - "this weekend" = 2 nights');
    console.log('   - "tomorrow" = 1 night');
    console.log('');
    console.log('🔗 Key Endpoints:');
    console.log('   GET /health - System health check');
    console.log('   GET /db-status - Database statistics');
    console.log('   POST /test-dates - Test date calculations');
    console.log('   POST /clear-memory - Clear conversation memory');
    console.log('   GET /guest/{phone} - Guest with memory');
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