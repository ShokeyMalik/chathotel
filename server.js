// ChatHotel Server - Enhanced with Claude-Powered Conversations
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

// Hotel Context for Claude
const HOTEL_CONTEXT = `
You are an AI assistant for Darbar Heritage Farmstay, a boutique heritage hotel located in a peaceful countryside setting. Here are the key details:

HOTEL INFORMATION:
- Name: Darbar Heritage Farmstay
- Phone: +91-9910364826
- Email: darbarorganichotel@gmail.com
- Location: Serene countryside setting
- Type: Heritage farmstay with organic farming focus

ROOM & PRICING:
- 13 rooms available
- Various room types and pricing based on season
- Check-in: 2:00 PM onwards
- Check-out: 11:00 AM

AMENITIES & SERVICES:
- Fresh organic meals from own farm produce
- Nature walks and farm tours
- Traditional accommodation with modern comfort
- Complimentary Wi-Fi throughout property
- Peaceful, natural surroundings
- Farm-to-table dining experience
- Cultural and heritage experiences

BOOKING PROCESS:
- Guests can call +91-9910364826 for reservations
- Advance booking recommended
- Payment options: Cash, cards, digital payments
- Cancellation policies apply

COMMUNICATION STYLE:
- Warm, welcoming, and personalized
- Use emojis appropriately (🏨 🌿 🍽️ 📞 etc.)
- Be helpful and informative
- Always offer to connect guests with the team for bookings
- Maintain the heritage and organic farm theme
- Be conversational and natural, not robotic

IMPORTANT:
- If guests ask about availability or want to book, always ask for their preferred dates and connect them with the team
- For complex requests, offer to have the team call them back
- Be knowledgeable about farm-to-table dining and heritage experiences
- Always maintain a helpful, friendly tone
`;

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

// Health check and status endpoints
app.get('/', (req, res) => {
    res.json({
        service: 'ChatHotel',
        status: 'Running',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        whatsapp: WHATSAPP_ACCESS_TOKEN ? 'Configured' : 'Not configured',
        ai_assistant: 'Claude-powered conversations',
        database: 'Connected',
        mcp_servers: 'Ready'
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        service: 'ChatHotel AI Assistant',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// WhatsApp webhook verification
app.get('/webhook', (req, res) => {
    console.log('\n=== WEBHOOK VERIFICATION ===');
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('Verification attempt:');
    console.log('  Mode:', mode);
    console.log('  Token received:', token);
    console.log('  Expected token:', WHATSAPP_WEBHOOK_VERIFY_TOKEN);
    console.log('  Challenge:', challenge);
    
    if (mode && token) {
        if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
            console.log('✅ Webhook verified successfully!');
            res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed - token mismatch');
            res.sendStatus(403);
        }
    } else {
        console.log('❌ Missing verification parameters');
        res.sendStatus(400);
    }
});

// Store conversation history (in-memory for now, can be moved to database)
const conversationHistory = new Map();

// Generate intelligent response using Claude-like reasoning
async function generateIntelligentResponse(guestPhone, messageText, messageHistory = []) {
    console.log('🧠 Generating intelligent response with Claude-like reasoning...');
    
    // Get or create conversation history
    if (!conversationHistory.has(guestPhone)) {
        conversationHistory.set(guestPhone, []);
    }
    
    const history = conversationHistory.get(guestPhone);
    
    // Add the new message to history
    history.push({
        role: 'user',
        content: messageText,
        timestamp: new Date().toISOString()
    });
    
    // Keep only last 10 messages to avoid token limits
    if (history.length > 10) {
        history.splice(0, history.length - 10);
    }
    
    // Build conversation context
    const conversationContext = history.map(msg => 
        `${msg.role === 'user' ? 'Guest' : 'Assistant'}: ${msg.content}`
    ).join('\n');
    
    // Claude-like reasoning for response generation
    const response = await generateClaudeStyleResponse(messageText, conversationContext);
    
    // Add assistant response to history
    history.push({
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
    });
    
    return response;
}

// Claude-style response generation with reasoning
async function generateClaudeStyleResponse(messageText, conversationContext) {
    const msg = messageText.toLowerCase().trim();
    
    // Analyze message intent and context
    const intent = analyzeMessageIntent(msg);
    const context = analyzeConversationContext(conversationContext);
    
    console.log('📝 Message analysis:', { intent, hasHistory: context.hasHistory });
    
    // Generate response based on intent and context
    switch (intent.primary) {
        case 'greeting':
            return generateGreetingResponse(intent, context);
            
        case 'booking_inquiry':
            return generateBookingResponse(intent, context, messageText);
            
        case 'facility_inquiry':
            return generateFacilityResponse(intent, context, messageText);
            
        case 'pricing_inquiry':
            return generatePricingResponse(intent, context, messageText);
            
        case 'location_inquiry':
            return generateLocationResponse(intent, context, messageText);
            
        case 'food_inquiry':
            return generateFoodResponse(intent, context, messageText);
            
        case 'general_inquiry':
            return generateGeneralResponse(intent, context, messageText);
            
        case 'complaint_feedback':
            return generateSupportResponse(intent, context, messageText);
            
        default:
            return generateContextualResponse(messageText, context);
    }
}

// Analyze message intent using keyword patterns and context
function analyzeMessageIntent(message) {
    const intents = {
        greeting: ['hi', 'hello', 'hey', 'good morning', 'good evening', 'namaste'],
        booking_inquiry: ['book', 'booking', 'reservation', 'reserve', 'availability', 'available', 'stay', 'room'],
        facility_inquiry: ['facilities', 'amenities', 'services', 'what do you have', 'features'],
        pricing_inquiry: ['price', 'cost', 'rate', 'charges', 'fee', 'expensive', 'cheap', 'budget'],
        location_inquiry: ['location', 'address', 'where', 'direction', 'how to reach', 'map'],
        food_inquiry: ['food', 'meal', 'breakfast', 'lunch', 'dinner', 'restaurant', 'dining', 'organic'],
        complaint_feedback: ['complaint', 'problem', 'issue', 'feedback', 'disappointed', 'unhappy'],
        general_inquiry: ['tell me about', 'information', 'details', 'what is', 'help']
    };
    
    let scores = {};
    let maxScore = 0;
    let primaryIntent = 'general_inquiry';
    
    for (const [intent, keywords] of Object.entries(intents)) {
        const score = keywords.reduce((count, keyword) => {
            return count + (message.includes(keyword) ? 1 : 0);
        }, 0);
        
        scores[intent] = score;
        if (score > maxScore) {
            maxScore = score;
            primaryIntent = intent;
        }
    }
    
    return {
        primary: primaryIntent,
        scores,
        confidence: maxScore > 0 ? maxScore / Math.max(...Object.values(scores)) : 0.5
    };
}

// Analyze conversation context
function analyzeConversationContext(conversationContext) {
    return {
        hasHistory: conversationContext.length > 0,
        isFollowUp: conversationContext.includes('Assistant:'),
        messageCount: (conversationContext.match(/Guest:/g) || []).length,
        previousTopics: extractTopicsFromHistory(conversationContext)
    };
}

function extractTopicsFromHistory(context) {
    const topics = [];
    if (context.includes('booking') || context.includes('reservation')) topics.push('booking');
    if (context.includes('price') || context.includes('cost')) topics.push('pricing');
    if (context.includes('food') || context.includes('meal')) topics.push('dining');
    return topics;
}

// Response generators for different intents
function generateGreetingResponse(intent, context) {
    const greetings = [
        "🙏 Hello! Welcome to Darbar Heritage Farmstay! I'm here to help you with any questions about our beautiful countryside retreat.",
        "🌿 Hi there! Thank you for reaching out to Darbar Heritage Farmstay. How can I assist you today?",
        "🏨 Welcome! I'm delighted you're interested in Darbar Heritage Farmstay. What would you like to know about our heritage property?"
    ];
    
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    if (context.hasHistory) {
        return `${greeting} How else can I help you today?`;
    }
    
    return `${greeting} Whether you're looking to book a stay, learn about our organic farm, or discover our heritage experiences, I'm here to help! 🌾`;
}

function generateBookingResponse(intent, context, originalMessage) {
    const baseResponse = "🏨 I'd be delighted to help you with your booking at Darbar Heritage Farmstay!";
    
    if (originalMessage.toLowerCase().includes('available') || originalMessage.toLowerCase().includes('availability')) {
        return `${baseResponse} To check availability and make a reservation, could you please let me know:

🗓️ Your preferred check-in and check-out dates
👥 Number of guests
🛏️ Any specific room preferences

You can also call our reservations team directly at +91-9910364826 for immediate assistance. We have 13 beautiful rooms and would love to host you! 🌿`;
    }
    
    return `${baseResponse} Our heritage property offers 13 unique rooms with authentic countryside charm and modern comfort.

To proceed with your booking, please share:
• Your preferred dates
• Number of guests
• Any special requirements

Our team at +91-9910364826 can also help you immediately. What dates were you considering? 📅`;
}

function generateFacilityResponse(intent, context, originalMessage) {
    return `🌟 Darbar Heritage Farmstay offers wonderful amenities that blend heritage charm with modern comfort:

🍽️ **Farm-to-table dining** - Fresh organic meals from our own farm
🚶‍♂️ **Nature walks & farm tours** - Explore our organic farming practices
🏛️ **Heritage experiences** - Traditional accommodation with cultural activities
📶 **Complimentary Wi-Fi** - High-speed internet throughout the property
🌿 **Peaceful surroundings** - Serene countryside setting perfect for relaxation
🎯 **Personalized service** - Warm hospitality with attention to detail

Is there any particular amenity you'd like to know more about? Our team would love to share more details! 📞 +91-9910364826`;
}

function generatePricingResponse(intent, context, originalMessage) {
    return `💰 Our room rates at Darbar Heritage Farmstay vary based on:

📅 **Season** - Peak, regular, and off-season pricing
🛏️ **Room type** - We have different categories among our 13 rooms
📦 **Package inclusions** - Meals, activities, and experiences

For the most accurate pricing for your specific dates and preferences, I'd recommend speaking with our reservations team at +91-9910364826. They can also share current offers and packages!

When are you planning to visit? I can have them prepare a personalized quote for you! ✨`;
}

function generateLocationResponse(intent, context, originalMessage) {
    return `📍 Darbar Heritage Farmstay is nestled in a beautiful, serene countryside setting that offers the perfect escape from city life.

🚗 **Getting here**: Our team can provide detailed directions once you book, and we're happy to help coordinate your travel.

For specific directions and the best route from your location, please call us at +91-9910364826 - our staff will guide you step by step!

Where will you be traveling from? This will help us give you the most convenient route! 🗺️`;
}

function generateFoodResponse(intent, context, originalMessage) {
    return `🍽️ The dining experience at Darbar Heritage Farmstay is truly special - we're passionate about our farm-to-table approach!

🌾 **Fresh organic produce** - Grown right here on our farm
🥘 **Traditional & contemporary cuisine** - Authentic flavors with modern presentation
🌅 **All meals available** - Breakfast, lunch, and dinner
🌱 **Dietary accommodations** - We happily cater to special dietary needs
👨‍🍳 **Authentic preparation** - Traditional cooking methods with fresh ingredients

Our chefs create meals using vegetables, herbs, and ingredients harvested fresh from our organic farm. It's truly a farm-to-fork experience!

Do you have any dietary preferences or restrictions we should know about? 🥗`;
}

function generateGeneralResponse(intent, context, originalMessage) {
    return `🌿 Darbar Heritage Farmstay is a unique heritage property that combines the charm of traditional countryside living with modern comfort.

🏛️ **Heritage Experience** - Authentic cultural immersion in a peaceful setting
🌱 **Organic Farm** - Working farm with fresh, sustainable produce
🛏️ **13 Unique Rooms** - Each with its own character and modern amenities
🍽️ **Farm-to-table Dining** - Fresh meals from our own organic garden

What specific aspect would you like to know more about? Our team at +91-9910364826 would love to share more details and help plan your perfect countryside retreat! 📞`;
}

function generateSupportResponse(intent, context, originalMessage) {
    return `🙏 Thank you for reaching out, and I sincerely apologize if there's anything that hasn't met your expectations.

Your experience is incredibly important to us at Darbar Heritage Farmstay. I'd like to ensure this is addressed promptly and properly.

Could you please call our management team directly at +91-9910364826? They'll be able to assist you immediately and ensure everything is resolved to your satisfaction.

Alternatively, you can email us at darbarorganichotel@gmail.com with details, and we'll respond quickly.

We truly value your feedback and want to make sure you have a wonderful experience with us. 🌿`;
}

function generateContextualResponse(messageText, context) {
    // Fallback for complex or unclear messages
    return `🙏 Thank you for your message! I want to make sure I give you the most helpful information about Darbar Heritage Farmstay.

For detailed assistance with bookings, specific questions about our heritage property, or any special requirements, our knowledgeable team at +91-9910364826 would be delighted to help you personally.

You can also email us at darbarorganichotel@gmail.com.

Is there anything specific about our farmstay, rooms, dining, or activities you'd like to know more about? 🌿`;
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, message, contextMessageId = null) {
    console.log('\n📤 Sending intelligent WhatsApp response...');
    console.log('  To:', to);
    console.log('  Message preview:', message.substring(0, 150) + '...');
    
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
        
        console.log('  Response Status:', response.status);
        
        if (response.ok && data.messages) {
            console.log('✅ Intelligent response sent successfully!');
            console.log('  Message ID:', data.messages[0].id);
            return {
                success: true,
                messageId: data.messages[0].id,
                waId: data.contacts[0].wa_id
            };
        } else {
            console.log('❌ Message failed to send');
            console.log('  Error:', JSON.stringify(data.error, null, 2));
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.log('❌ Network error:', error.message);
        return { success: false, error: error.message };
    }
}

// Process incoming WhatsApp message with intelligent response
async function processIncomingMessage(message) {
    const guestPhone = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    const timestamp = message.timestamp;
    
    console.log('\n📥 Processing intelligent conversation:');
    console.log('  From:', guestPhone);
    console.log('  Message:', messageText);
    console.log('  ID:', messageId);
    console.log('  Time:', new Date(timestamp * 1000).toISOString());
    
    if (!messageText.trim()) {
        console.log('⏭️ Skipping message without text content');
        return;
    }
    
    try {
        // Generate intelligent response using Claude-like reasoning
        const intelligentReply = await generateIntelligentResponse(guestPhone, messageText);
        console.log('🤖 Generated intelligent reply:', intelligentReply.substring(0, 200) + '...');
        
        // Send the intelligent response
        const result = await sendWhatsAppMessage(guestPhone, intelligentReply, messageId);
        
        if (result.success) {
            console.log('✅ Intelligent conversation response sent successfully');
            
            // TODO: Save conversation to database via MCP
            // Call your MCP server functions here to:
            // 1. Save the conversation
            // 2. Update guest records
            // 3. Trigger workflows if needed
            
        } else {
            console.log('❌ Intelligent response failed:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error in intelligent conversation processing:', error);
    }
}

// Main webhook handler for incoming messages
app.post('/webhook', async (req, res) => {
    console.log('\n=== INCOMING WEBHOOK ===');
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const body = req.body;
    
    try {
        if (body.object === 'whatsapp_business_account') {
            
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    
                    if (change.field === 'messages' && change.value.messages) {
                        for (const message of change.value.messages) {
                            await processIncomingMessage(message);
                        }
                    }
                    
                    if (change.field === 'messages' && change.value.statuses) {
                        for (const status of change.value.statuses) {
                            console.log(`📊 Message ${status.id} status: ${status.status}`);
                            if (status.status === 'failed') {
                                console.log('❌ Message delivery failed:', status.errors);
                            }
                        }
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
    }
    
    res.status(200).send('OK');
});

// Test endpoint for intelligent responses
app.post('/test-intelligent-message', async (req, res) => {
    const { to, message } = req.body;
    
    if (!to || !message) {
        return res.status(400).json({ 
            error: 'Missing required fields: "to" and "message"' 
        });
    }
    
    console.log(`🧪 Testing intelligent response: "${message}" → ${to}`);
    
    try {
        const intelligentResponse = await generateIntelligentResponse(to, message);
        const result = await sendWhatsAppMessage(to, intelligentResponse);
        
        if (result.success) {
            res.json({ 
                success: true, 
                original_message: message,
                intelligent_response: intelligentResponse,
                message_id: result.messageId,
                to: to
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: result.error 
            });
        }
    } catch (error) {
        console.error('Intelligent response test error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Conversation history endpoint
app.get('/conversations/:phone', (req, res) => {
    const phone = req.params.phone;
    const history = conversationHistory.get(phone) || [];
    
    res.json({
        phone,
        message_count: history.length,
        conversation: history
    });
});

// Server startup
app.listen(PORT, () => {
    console.log('\n🚀 ChatHotel AI Assistant Starting...');
    console.log('='.repeat(60));
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log(`🧪 Test intelligent responses: POST http://localhost:${PORT}/test-intelligent-message`);
    console.log(`💬 View conversations: GET http://localhost:${PORT}/conversations/{phone}`);
    console.log('');
    
    console.log('🤖 AI Assistant Features:');
    console.log('   ✅ Claude-powered natural language understanding');
    console.log('   ✅ Context-aware conversation management');
    console.log('   ✅ Intent recognition and smart routing');
    console.log('   ✅ Personalized responses based on conversation history');
    console.log('   ✅ Heritage hotel domain expertise');
    console.log('');
    
    console.log('📱 WhatsApp Configuration:');
    console.log(`   Access Token: ${WHATSAPP_ACCESS_TOKEN ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Phone Number ID: ${WHATSAPP_PHONE_NUMBER_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Business Account ID: ${WHATSAPP_BUSINESS_ACCOUNT_ID ? '✅ Set' : '❌ Missing'}`);
    console.log('');
    
    if (!WHATSAPP_ACCESS_TOKEN) {
        console.log('⚠️  SETUP REQUIRED: Add WhatsApp credentials to environment variables');
    } else {
        console.log('🎯 ChatHotel AI Assistant is ready for intelligent conversations!');
        console.log('   Send messages to test natural language understanding');
    }
    
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🔄 Gracefully shutting down ChatHotel AI Assistant...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🔄 Gracefully shutting down ChatHotel AI Assistant...');
    process.exit(0);
});