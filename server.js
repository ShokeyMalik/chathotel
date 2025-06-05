// ChatHotel Server - Session Mode (Works without database)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// WhatsApp Configuration
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'chathotelwhatsapp';

// Claude API Configuration
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Session storage (memory-based, works without database)
const sessionStorage = {
    guests: new Map(),
    conversations: new Map(),
    bookings: new Map()
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

// Session-based guest management
function findOrCreateGuestSession(phoneNumber, name = null) {
    console.log('🔍 Looking up guest in session:', phoneNumber);
    
    let guest = sessionStorage.guests.get(phoneNumber);
    if (!guest) {
        guest = {
            id: `guest_${Date.now()}`,
            phone: phoneNumber,
            name: name || `Guest ${phoneNumber.slice(-4)}`,
            email: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            bookings: [],
            preferences: {},
            totalSpent: 0,
            loyaltyTier: 'new'
        };
        sessionStorage.guests.set(phoneNumber, guest);
        console.log('👤 Created new guest session:', guest.name);
    } else {
        guest.updatedAt = new Date();
        console.log('✅ Found existing guest session:', guest.name);
    }
    
    return guest;
}

function saveMessageToSession(guestId, messageText, direction = 'incoming', messageId = null) {
    console.log('💾 Saving message to session');
    
    const message = {
        id: `msg_${Date.now()}`,
        guestId: guestId,
        content: messageText,
        direction: direction,
        platform: 'whatsapp',
        messageId: messageId,
        createdAt: new Date()
    };
    
    if (!sessionStorage.conversations.has(guestId)) {
        sessionStorage.conversations.set(guestId, []);
    }
    
    const conversation = sessionStorage.conversations.get(guestId);
    conversation.push(message);
    
    // Keep only last 20 messages per guest
    if (conversation.length > 20) {
        conversation.splice(0, conversation.length - 20);
    }
    
    console.log('✅ Message saved to session');
    return message;
}

function getGuestContextFromSession(guest) {
    console.log('📋 Building guest context from session');
    
    if (!guest) return '';
    
    const conversation = sessionStorage.conversations.get(guest.id) || [];
    const messageCount = conversation.length;
    
    let context = `Guest Information (Session):
- Name: ${guest.name}
- Phone: ${guest.phone}
- Session messages: ${messageCount}
- Loyalty tier: ${guest.loyaltyTier}
- Join time: ${guest.createdAt.toLocaleString()}`;

    if (messageCount > 0) {
        const lastMessage = conversation[conversation.length - 1];
        context += `
- Last message: ${lastMessage.createdAt.toLocaleString()}
- Conversation active: Yes`;
    }

    // Simulate booking context based on conversation history
    const bookingKeywords = conversation.filter(msg => 
        msg.content.toLowerCase().includes('book') || 
        msg.content.toLowerCase().includes('room') ||
        msg.content.toLowerCase().includes('stay')
    );

    if (bookingKeywords.length > 0) {
        context += `
- Booking interest: High (mentioned ${bookingKeywords.length} times)`;
    }

    return context;
}

// Enhanced Claude API call with session context
async function callClaudeWithSessionContext(messages, guestContext) {
    if (!CLAUDE_API_KEY) {
        console.log('❌ Claude API not configured, using enhanced fallback');
        return generateIntelligentSessionFallback(messages[messages.length - 1].content, guestContext);
    }

    const systemPrompt = `You are an AI assistant for Darbar Heritage Farmstay, a beautiful heritage hotel in the countryside.

HOTEL INFORMATION:
- Name: Darbar Heritage Farmstay
- Phone: +91-9910364826
- Email: darbarorganichotel@gmail.com
- Rooms: 13 unique heritage rooms
- Specialty: Organic farm-to-table dining
- Features: Nature walks, heritage experiences, peaceful countryside setting

GUEST CONTEXT (Current Session):
${guestContext}

CAPABILITIES:
- Provide detailed hotel information
- Help with booking inquiries
- Answer questions about amenities, location, food
- Handle special requests and celebrations
- Offer personalized recommendations

INSTRUCTIONS:
- Be warm, welcoming, and knowledgeable about the property
- Use the guest's conversation history to personalize responses
- For bookings, collect: dates, guest count, preferences
- Always provide phone number +91-9910364826 for direct bookings
- Use emojis appropriately (🏨 🌿 🍽️ 📞 etc.)
- Create excitement about the heritage farm experience
- Remember this is session-based (no permanent storage)`;

    try {
        console.log('🤖 Calling Claude API with session context...');
        
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
        console.log('✅ Claude API response received');
        return data.content[0].text;
    } catch (error) {
        console.error('❌ Claude API error:', error);
        return generateIntelligentSessionFallback(messages[messages.length - 1].content, guestContext);
    }
}

function generateIntelligentSessionFallback(message, guestContext) {
    const msg = message.toLowerCase();
    const isReturningConversation = guestContext.includes('Session messages:') && 
                                   !guestContext.includes('Session messages: 1');
    
    console.log('🔄 Generating intelligent session-based fallback');
    
    if (msg.includes('wedding') || msg.includes('event')) {
        return `🌸 How wonderful! Darbar Heritage Farmstay would be a magical venue for your wedding! Our heritage property with organic farm setting creates the perfect romantic atmosphere.

For wedding planning, our events team at +91-9910364826 can help with:
🌿 Heritage courtyard ceremonies  
🍽️ Farm-to-table catering with organic produce
🏛️ Traditional heritage accommodations for guests
🌺 Floral arrangements with fresh farm flowers

What date are you considering? I'd love to help you create the perfect countryside wedding! 💒`;
    }
    
    if (msg.includes('book') || msg.includes('room') || msg.includes('stay')) {
        const greeting = isReturningConversation ? 
            `Welcome back! I see we were discussing your stay.` : 
            `Welcome to Darbar Heritage Farmstay!`;
            
        return `🏨 ${greeting} I'd be delighted to help you plan your countryside retreat!

Our heritage property offers:
🛏️ 13 unique heritage rooms with modern comfort
🌿 Organic farm experiences and nature walks  
🍽️ Fresh farm-to-table dining
🏛️ Authentic heritage cultural experiences

To check availability and book:
📅 What dates are you considering?
👥 How many guests?
🌟 Any special preferences or occasions?

Call us directly at +91-9910364826 for immediate booking assistance! 📞`;
    }
    
    if (msg.includes('food') || msg.includes('meal') || msg.includes('dining')) {
        return `🍽️ The dining experience at Darbar Heritage Farmstay is truly special! We're passionate about our farm-to-table approach:

🌾 **Fresh Organic Produce** - Grown right here on our farm
🥘 **Traditional & Contemporary Cuisine** - Authentic flavors with modern presentation  
🌅 **All Meals Available** - Breakfast, lunch, and dinner
🌱 **Dietary Accommodations** - We cater to all dietary preferences
👨‍🍳 **Heritage Cooking** - Traditional methods with fresh ingredients

Our chefs create meals using vegetables, herbs, and ingredients harvested fresh from our organic farm. It's a true farm-to-fork experience!

Do you have any dietary preferences we should know about? 🥗`;
    }
    
    if (msg.includes('location') || msg.includes('direction') || msg.includes('where')) {
        return `📍 Darbar Heritage Farmstay is nestled in beautiful, serene countryside - the perfect escape from city life!

🚗 **Getting Here**: We provide detailed directions upon booking
🗺️ **Scenic Route**: The journey itself is part of the experience
🌄 **Countryside Setting**: Peaceful, natural surroundings
🏞️ **Away from Crowds**: Perfect for relaxation and rejuvenation

For specific directions from your location, please call us at +91-9910364826 - our team will guide you step by step and ensure you have the most scenic route!

Where will you be traveling from? This helps us provide the best directions! 🛣️`;
    }
    
    if (msg.includes('price') || msg.includes('cost') || msg.includes('rate')) {
        return `💰 Our heritage room rates are designed to offer exceptional value for the complete countryside experience:

📊 **Pricing varies by**:
• Season (peak, regular, off-season)
• Room type (we have different heritage room categories)  
• Package inclusions (meals, activities, experiences)

🎯 **What's Included**:
• Heritage accommodation with modern amenities
• Organic farm experiences
• Access to nature walks and farm tours
• Complimentary Wi-Fi

For current rates and special packages for your dates, please call +91-9910364826. Our team can create a personalized quote based on your preferences!

When are you planning to visit? I can have them prepare specific pricing for you! ✨`;
    }
    
    // Default response
    const greeting = isReturningConversation ? 
        `Thank you for continuing our conversation!` : 
        `Welcome to Darbar Heritage Farmstay!`;
        
    return `🙏 ${greeting} I'm here to help you discover our beautiful heritage property and organic farm experience.

Whether you're interested in:
🏨 Booking a heritage room
🌿 Learning about our organic farm
🍽️ Our farm-to-table dining experience  
🎉 Planning a special celebration
📍 Getting directions to our property

I'm here to assist! For immediate bookings and detailed information, our team at +91-9910364826 is always ready to help.

What would you like to know about Darbar Heritage Farmstay? 🌾`;
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, message, contextMessageId = null) {
    console.log('\n📤 Sending session-based WhatsApp response...');
    console.log('  To:', to);
    console.log('  Message preview:', message.substring(0, 100) + '...');
    
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
            console.log('✅ Session-based response sent successfully!');
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

// Process incoming message with session context
async function processIncomingMessageSession(message) {
    const guestPhone = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    
    console.log('\n📥 Processing message with session context:');
    console.log('  From:', guestPhone);
    console.log('  Message:', messageText);
    
    if (!messageText.trim()) {
        console.log('⏭️ Skipping non-text message');
        return;
    }
    
    try {
        // Create or get guest session
        const guest = findOrCreateGuestSession(guestPhone);
        
        // Save incoming message to session
        saveMessageToSession(guest.id, messageText, 'incoming', messageId);
        
        // Get guest context from session
        const guestContext = getGuestContextFromSession(guest);
        
        // Get recent conversation from session
        const conversation = sessionStorage.conversations.get(guest.id) || [];
        const messages = conversation
            .slice(-10) // Last 10 messages
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
        
        // Generate AI response with session context
        const aiResponse = await callClaudeWithSessionContext(messages, guestContext);
        console.log('🤖 Claude generated session-based response');
        
        // Save AI response to session
        saveMessageToSession(guest.id, aiResponse, 'outgoing');
        
        // Send WhatsApp reply
        const result = await sendWhatsAppMessage(guestPhone, aiResponse, messageId);
        
        if (result.success) {
            console.log('✅ Session-based intelligent response sent successfully!');
        } else {
            console.log('❌ Failed to send response:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error in session-based message processing:', error);
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'ChatHotel Session-Based AI',
        version: '5.0.0',
        mode: 'Session Storage (No Database Required)',
        ai_powered: true,
        claude_integration: !!CLAUDE_API_KEY,
        session_guests: sessionStorage.guests.size,
        active_conversations: sessionStorage.conversations.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        service: 'ChatHotel Session AI',
        mode: 'Session Storage',
        claude_available: !!CLAUDE_API_KEY,
        session_active: true,
        uptime: process.uptime()
    });
});

// Session status endpoint
app.get('/session-status', (req, res) => {
    const sessions = Array.from(sessionStorage.guests.values()).map(guest => ({
        name: guest.name,
        phone: guest.phone.slice(-4) + 'XXX', // Privacy
        messages: sessionStorage.conversations.get(guest.id)?.length || 0,
        last_active: guest.updatedAt
    }));
    
    res.json({
        mode: 'Session Storage',
        total_guests: sessionStorage.guests.size,
        total_conversations: sessionStorage.conversations.size,
        sessions: sessions
    });
});

// Guest session lookup
app.get('/guest-session/:phone', (req, res) => {
    const guest = sessionStorage.guests.get(req.params.phone);
    if (!guest) {
        return res.status(404).json({ error: 'Guest session not found' });
    }
    
    const conversation = sessionStorage.conversations.get(guest.id) || [];
    res.json({
        guest: guest,
        messages: conversation,
        context: getGuestContextFromSession(guest)
    });
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
    console.log('\n=== INCOMING WEBHOOK (SESSION MODE) ===');
    const body = req.body;
    
    res.status(200).send('OK');
    
    if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field === 'messages' && change.value.messages) {
                    for (const message of change.value.messages) {
                        await processIncomingMessageSession(message);
                    }
                }
            }
        }
    }
});

// Server startup
app.listen(PORT, () => {
    console.log('\n🚀 ChatHotel Session-Based AI Starting...');
    console.log('='.repeat(60));
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`💾 Storage Mode: Session-based (memory only)`);
    console.log(`🤖 Claude API: ${CLAUDE_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📱 WhatsApp: ${WHATSAPP_ACCESS_TOKEN ? '✅ Ready' : '❌ Not configured'}`);
    console.log('');
    console.log('🎯 Features:');
    console.log('   ✅ Intelligent conversation management');
    console.log('   ✅ Session-based guest context');
    console.log('   ✅ Claude-powered responses');
    console.log('   ✅ No database dependency');
    console.log('   ✅ Production-ready for immediate use');
    console.log('');
    console.log('🔗 Endpoints:');
    console.log('   GET /session-status - View active sessions');
    console.log('   GET /guest-session/{phone} - Guest session lookup');
    console.log('');
    console.log('📝 Note: Using session storage - conversations reset on restart');
    console.log('   Database integration available once Supabase is fixed');
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down session-based server...');
    console.log(`📊 Final stats: ${sessionStorage.guests.size} guests, ${sessionStorage.conversations.size} conversations`);
    process.exit(0);
});