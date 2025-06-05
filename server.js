require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// WhatsApp Configuration
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'chathotelwhatsapp';

// Claude API Configuration
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Enhanced session storage
const guestSessions = new Map();
const conversationHistory = new Map();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS
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

// Enhanced guest session management
function createOrUpdateGuestSession(phoneNumber, name = null) {
    console.log('👤 Managing guest session:', phoneNumber);
    
    let guest = guestSessions.get(phoneNumber);
    
    if (!guest) {
        guest = {
            id: `guest_${Date.now()}`,
            phone: phoneNumber,
            name: name || `Guest ${phoneNumber.slice(-4)}`,
            firstContact: new Date(),
            lastContact: new Date(),
            messageCount: 0,
            interests: [],
            bookingIntent: false,
            preferredContactTime: null
        };
        guestSessions.set(phoneNumber, guest);
        conversationHistory.set(phoneNumber, []);
        console.log('✅ New guest session created');
    } else {
        guest.lastContact = new Date();
        guest.messageCount += 1;
        console.log(`✅ Updated existing guest session (${guest.messageCount} messages)`);
    }
    
    return guest;
}

function addToConversationHistory(phoneNumber, message, direction = 'incoming') {
    const history = conversationHistory.get(phoneNumber) || [];
    
    history.push({
        message: message,
        direction: direction,
        timestamp: new Date(),
        processed: true
    });
    
    // Keep only last 20 messages
    if (history.length > 20) {
        history.splice(0, history.length - 20);
    }
    
    conversationHistory.set(phoneNumber, history);
    
    // Update guest interests based on conversation
    updateGuestInterests(phoneNumber, message);
}

function updateGuestInterests(phoneNumber, message) {
    const guest = guestSessions.get(phoneNumber);
    if (!guest) return;
    
    const msg = message.toLowerCase();
    const interests = guest.interests;
    
    // Track interests
    if (msg.includes('wedding') && !interests.includes('wedding')) {
        interests.push('wedding');
    }
    if (msg.includes('anniversary') && !interests.includes('anniversary')) {
        interests.push('anniversary');
    }
    if (msg.includes('organic') || msg.includes('farm') && !interests.includes('organic_farm')) {
        interests.push('organic_farm');
    }
    if (msg.includes('book') || msg.includes('room') || msg.includes('stay')) {
        guest.bookingIntent = true;
    }
    
    // Update guest session
    guestSessions.set(phoneNumber, guest);
}

function getGuestContext(phoneNumber) {
    const guest = guestSessions.get(phoneNumber);
    const history = conversationHistory.get(phoneNumber) || [];
    
    if (!guest) return '';
    
    const isReturning = guest.messageCount > 1;
    const hasInterests = guest.interests.length > 0;
    const hasBookingIntent = guest.bookingIntent;
    
    let context = `Guest Profile:
- Name: ${guest.name}
- Phone: ${guest.phone}
- First contact: ${guest.firstContact.toLocaleDateString()}
- Total messages: ${guest.messageCount}
- Returning conversation: ${isReturning ? 'Yes' : 'No'}`;

    if (hasInterests) {
        context += `\n- Interests: ${guest.interests.join(', ')}`;
    }
    
    if (hasBookingIntent) {
        context += `\n- Booking intent: High`;
    }
    
    if (history.length > 0) {
        const recentMessages = history.slice(-3).map(h => `${h.direction}: ${h.message}`).join('\n');
        context += `\n- Recent conversation:\n${recentMessages}`;
    }
    
    return context;
}

// Claude API integration
async function generateIntelligentResponse(phoneNumber, message) {
    const guestContext = getGuestContext(phoneNumber);
    const guest = guestSessions.get(phoneNumber);
    
    if (!CLAUDE_API_KEY) {
        return generateSmartFallback(message, guest);
    }

    const systemPrompt = `You are an AI assistant for Darbar Heritage Farmstay, a beautiful boutique heritage hotel in the countryside.

HOTEL INFORMATION:
- Name: Darbar Heritage Farmstay
- Phone: +91-9910364826
- Email: darbarorganichotel@gmail.com
- Rooms: 13 unique heritage rooms
- Location: Peaceful countryside setting
- Specialty: Organic farm-to-table dining, heritage experiences

GUEST CONTEXT:
${guestContext}

PERSONALITY: Warm, knowledgeable, and genuinely helpful. Create excitement about the heritage farm experience.

INSTRUCTIONS:
- Personalize responses based on guest history and interests
- For booking inquiries: ask for dates, guest count, preferences
- Always provide phone number +91-9910364826 for bookings
- Use appropriate emojis (🏨 🌿 🍽️ 📞 etc.)
- If guest shows wedding/anniversary interest, emphasize romantic countryside setting
- If guest mentions organic/farm, highlight the farm-to-table experience
- Keep responses conversational and engaging`;

    const conversationHistory = [
        {
            role: 'user',
            content: message
        }
    ];

    try {
        console.log('🤖 Calling Claude API...');
        
        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 300,
                system: systemPrompt,
                messages: conversationHistory
            })
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Claude response generated');
        return data.content[0].text;
        
    } catch (error) {
        console.error('❌ Claude API error:', error.message);
        return generateSmartFallback(message, guest);
    }
}

function generateSmartFallback(message, guest) {
    const msg = message.toLowerCase();
    const isReturning = guest && guest.messageCount > 1;
    const hasWeddingInterest = guest && guest.interests.includes('wedding');
    const hasBookingIntent = guest && guest.bookingIntent;
    
    console.log('🧠 Generating smart fallback response');
    
    // Wedding inquiries
    if (msg.includes('wedding') || msg.includes('marry') || msg.includes('ceremony')) {
        return `🌸 How magical! Darbar Heritage Farmstay would be absolutely perfect for your wedding celebration!

Our countryside heritage property offers:
💒 Beautiful heritage courtyard for ceremonies
🌿 Organic farm setting with natural beauty
🍽️ Farm-to-table catering with fresh produce
🏛️ Authentic heritage accommodations for guests
🌺 Romantic countryside atmosphere

Our events team at +91-9910364826 specializes in creating unforgettable countryside weddings. When are you planning your special day? ✨`;
    }
    
    // Booking inquiries
    if (msg.includes('book') || msg.includes('room') || msg.includes('stay') || msg.includes('reservation')) {
        const greeting = isReturning ? 
            `Welcome back! I see you're interested in booking with us.` : 
            `Welcome to Darbar Heritage Farmstay!`;
            
        let specialOffer = '';
        if (hasWeddingInterest) {
            specialOffer = '\n🌸 Perfect for your wedding celebration! ';
        }
        
        return `🏨 ${greeting} I'd be delighted to help you plan your countryside retreat!${specialOffer}

Our heritage property features:
🛏️ 13 unique heritage rooms with modern comfort
🌾 Organic farm experiences and nature walks
🍽️ Fresh farm-to-table dining
🏛️ Authentic heritage cultural experiences

To book your perfect stay:
📅 What dates are you considering?
👥 How many guests?
🌟 Any special occasions or preferences?

Call our team at +91-9910364826 for immediate booking assistance! 📞`;
    }
    
    // Food and dining
    if (msg.includes('food') || msg.includes('meal') || msg.includes('dining') || msg.includes('organic')) {
        return `🍽️ The dining experience at Darbar Heritage Farmstay is truly exceptional!

🌾 **Farm-to-Table Excellence:**
• Fresh organic vegetables grown on our property
• Traditional recipes with modern presentation
• All meals available: breakfast, lunch, dinner
• Dietary preferences accommodated
• Heritage cooking methods with fresh ingredients

Our chefs harvest ingredients fresh from our organic farm daily - it's a true farm-to-fork experience that connects you with the land and local traditions.

Do you have any dietary preferences we should know about? Our team at +91-9910364826 can customize meals for you! 🥗`;
    }
    
    // Location and directions
    if (msg.includes('location') || msg.includes('where') || msg.includes('direction') || msg.includes('address')) {
        return `📍 Darbar Heritage Farmstay is nestled in beautiful, serene countryside - the perfect escape from urban life!

🌄 **Our Location:**
• Peaceful countryside setting away from crowds
• Surrounded by organic farming land
• Traditional heritage architecture
• Easy access with scenic drive

🚗 **Getting Here:**
Our team provides detailed, personalized directions upon booking. The journey itself becomes part of your countryside experience!

For specific directions from your location, call us at +91-9910364826 - we'll guide you to our little slice of paradise! 🗺️

Where will you be traveling from?`;
    }
    
    // Pricing inquiries
    if (msg.includes('price') || msg.includes('cost') || msg.includes('rate') || msg.includes('expensive')) {
        return `💰 Our heritage accommodation offers exceptional value for the complete countryside experience:

🏨 **What Influences Pricing:**
• Season (peak, regular, off-season rates)
• Room category (13 different heritage rooms)
• Package inclusions (meals, activities, experiences)
• Duration of stay

🎁 **Included in Your Stay:**
• Heritage accommodation with modern amenities
• Access to organic farm and nature walks
• Complimentary Wi-Fi throughout property
• Cultural heritage experiences

For personalized pricing and current offers, our reservations team at +91-9910364826 will create a perfect package for your dates and preferences!

When are you planning to visit us? 📅`;
    }
    
    // Default personalized response
    const greeting = isReturning ? 
        `Thank you for continuing our conversation! ` : 
        `Welcome to Darbar Heritage Farmstay! `;
        
    let personalNote = '';
    if (hasBookingIntent) {
        personalNote = 'I see you\'re interested in booking with us - how exciting! ';
    }
    if (hasWeddingInterest) {
        personalNote += 'Our romantic countryside setting would be perfect for your celebration! ';
    }
    
    return `🙏 ${greeting}${personalNote}I'm here to help you discover our beautiful heritage property and organic farm experience.

Whether you're interested in:
🏨 Booking our heritage accommodations
🌿 Learning about our organic farm
🍽️ Our farm-to-table dining
🎉 Planning special celebrations
📍 Getting directions to our property

I'm here to assist! Our knowledgeable team at +91-9910364826 is always ready to help with bookings and detailed information.

What would you like to know about Darbar Heritage Farmstay? 🌾`;
}

// WhatsApp message sending
async function sendWhatsAppMessage(to, message, contextMessageId = null) {
    console.log(`📤 Sending message to ${to}`);
    
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        console.log('❌ WhatsApp credentials missing');
        return false;
    }
    
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
        const response = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok && data.messages) {
            console.log('✅ Message sent successfully');
            return { success: true, messageId: data.messages[0].id };
        } else {
            console.log('❌ Message failed:', data.error);
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.log('❌ Network error:', error.message);
        return { success: false, error: error.message };
    }
}

// Main message handler
async function handleIncomingMessage(message) {
    const phoneNumber = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    
    console.log(`\n📥 Processing message from ${phoneNumber}: "${messageText}"`);
    
    if (!messageText.trim()) {
        console.log('⏭️ Skipping non-text message');
        return;
    }
    
    try {
        // Create or update guest session
        const guest = createOrUpdateGuestSession(phoneNumber);
        
        // Add to conversation history
        addToConversationHistory(phoneNumber, messageText, 'incoming');
        
        // Generate intelligent response
        const aiResponse = await generateIntelligentResponse(phoneNumber, messageText);
        
        // Add AI response to conversation history
        addToConversationHistory(phoneNumber, aiResponse, 'outgoing');
        
        // Send WhatsApp reply
        const result = await sendWhatsAppMessage(phoneNumber, aiResponse, messageId);
        
        if (result.success) {
            console.log('✅ Intelligent response sent successfully!');
        } else {
            console.log('❌ Failed to send response:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error processing message:', error);
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'ChatHotel Enhanced Session AI',
        version: '6.0.0',
        mode: 'Enhanced Session Storage',
        ai_powered: true,
        claude_integration: !!CLAUDE_API_KEY,
        active_guests: guestSessions.size,
        total_conversations: Array.from(conversationHistory.values()).reduce((total, history) => total + history.length, 0),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        service: 'ChatHotel Enhanced Session AI',
        claude_available: !!CLAUDE_API_KEY,
        whatsapp_ready: !!WHATSAPP_ACCESS_TOKEN,
        active_sessions: guestSessions.size,
        uptime: process.uptime()
    });
});

// Guest analytics endpoint
app.get('/analytics', (req, res) => {
    const guests = Array.from(guestSessions.values());
    const totalMessages = Array.from(conversationHistory.values()).reduce((total, history) => total + history.length, 0);
    
    res.json({
        total_guests: guests.length,
        total_messages: totalMessages,
        booking_intent_guests: guests.filter(g => g.bookingIntent).length,
        guests_with_interests: guests.filter(g => g.interests.length > 0).length,
        popular_interests: guests.reduce((acc, guest) => {
            guest.interests.forEach(interest => {
                acc[interest] = (acc[interest] || 0) + 1;
            });
            return acc;
        }, {}),
        average_messages_per_guest: guests.length > 0 ? (totalMessages / guests.length).toFixed(1) : 0
    });
});

// Guest details endpoint
app.get('/guest/:phone', (req, res) => {
    const guest = guestSessions.get(req.params.phone);
    const history = conversationHistory.get(req.params.phone) || [];
    
    if (!guest) {
        return res.status(404).json({ error: 'Guest not found' });
    }
    
    res.json({
        guest: guest,
        conversation_history: history,
        context: getGuestContext(req.params.phone)
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
                        await handleIncomingMessage(message);
                    }
                }
            }
        }
    }
});

// Server startup
app.listen(PORT, () => {
    console.log('\n🚀 ChatHotel Enhanced Session AI Starting...');
    console.log('='.repeat(60));
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`💾 Storage: Enhanced session-based (in-memory)`);
    console.log(`🤖 Claude API: ${CLAUDE_API_KEY ? '✅ Configured' : '❌ Not configured (using smart fallback)'}`);
    console.log(`📱 WhatsApp: ${WHATSAPP_ACCESS_TOKEN ? '✅ Ready' : '❌ Not configured'}`);
    console.log('');
    console.log('🎯 Enhanced Features:');
    console.log('   ✅ Guest session management with interests tracking');
    console.log('   ✅ Conversation history and context awareness');
    console.log('   ✅ Claude-powered intelligent responses');
    console.log('   ✅ Smart fallback system for high availability');
    console.log('   ✅ Booking intent detection');
    console.log('   ✅ Personalized responses based on guest history');
    console.log('');
    console.log('🔗 Available Endpoints:');
    console.log('   GET / - Service status');
    console.log('   GET /health - Health check');
    console.log('   GET /analytics - Guest analytics');
    console.log('   GET /guest/{phone} - Guest session details');
    console.log('');
    console.log('💡 This version works without database and provides intelligent');
    console.log('   guest experiences with conversation memory and personalization!');
    console.log('='.repeat(60));
});

process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down...');
    console.log(`📊 Final stats: ${guestSessions.size} guests, ${Array.from(conversationHistory.values()).reduce((total, history) => total + history.length, 0)} messages`);
    process.exit(0);
});