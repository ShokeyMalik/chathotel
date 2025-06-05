// ChatHotel Server - Real Claude AI Integration
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'chathotelwhatsapp';

// Claude API Configuration (you'll need to add this to environment variables)
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY; // Add this to your Render environment variables
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

// Conversation history storage
const conversationHistory = new Map();

// Hotel Context for Claude
const HOTEL_SYSTEM_PROMPT = `You are an AI assistant for Darbar Heritage Farmstay, a boutique heritage hotel. You are knowledgeable, warm, and helpful. Here's what you need to know:

HOTEL DETAILS:
- Name: Darbar Heritage Farmstay
- Phone: +91-9910364826
- Email: darbarorganichotel@gmail.com
- Rooms: 13 unique heritage rooms
- Location: Peaceful countryside setting
- Specialty: Farm-to-table dining with organic produce grown on-site

KEY FEATURES:
- Heritage cultural experiences
- Organic farming and fresh produce
- Nature walks and farm tours
- Traditional accommodation with modern amenities
- Complimentary Wi-Fi
- Check-in: 2:00 PM, Check-out: 11:00 AM

YOUR ROLE:
- Be conversational and natural, not robotic
- Understand context and intent from guest messages
- Ask clarifying questions when needed
- For bookings, always ask for dates and guest count
- Direct complex requests to call +91-9910364826
- Use appropriate emojis (🏨 🌿 🍽️ 📞 etc.)
- Remember previous conversation context
- Be helpful but always encourage direct contact for bookings

IMPORTANT: You can understand context, answer follow-up questions, and have natural conversations. If guests ask about weddings, events, specific dates, pricing, or want to book, get their details and connect them with the team.`;

// Real Claude API Integration
async function callClaudeAPI(messages) {
    if (!CLAUDE_API_KEY) {
        console.log('❌ Claude API key not configured, falling back to basic responses');
        return generateFallbackResponse(messages[messages.length - 1].content);
    }

    try {
        console.log('🤖 Calling real Claude API...');
        
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
                system: HOTEL_SYSTEM_PROMPT,
                messages: messages
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Claude API error:', errorData);
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Claude API response received');
        
        return data.content[0].text;
    } catch (error) {
        console.error('❌ Error calling Claude API:', error);
        return generateFallbackResponse(messages[messages.length - 1].content);
    }
}

// Fallback response for when Claude API is not available
function generateFallbackResponse(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('wedding')) {
        return `🌸 Darbar Heritage Farmstay would be a beautiful venue for a wedding! Our heritage property and organic farm setting create a unique atmosphere. For wedding arrangements, please call our events team at +91-9910364826 - they'll help plan every detail of your special day! 💒`;
    }
    
    if (msg.includes('book') || msg.includes('reservation')) {
        return `🏨 I'd love to help you book a stay at Darbar Heritage Farmstay! To check availability and make your reservation, please call +91-9910364826. Our team can discuss dates, room options, and create the perfect countryside retreat for you! 📞`;
    }
    
    return `🙏 Thank you for your interest in Darbar Heritage Farmstay! For the best assistance with your inquiry, please call our team at +91-9910364826. They'll be happy to help with bookings, events, and any questions about our heritage property! 🌿`;
}

// Generate intelligent response using real Claude
async function generateIntelligentResponse(guestPhone, messageText) {
    console.log('🧠 Generating response with real Claude AI...');
    
    // Get or create conversation history
    if (!conversationHistory.has(guestPhone)) {
        conversationHistory.set(guestPhone, []);
    }
    
    const history = conversationHistory.get(guestPhone);
    
    // Build messages for Claude API
    const messages = [];
    
    // Add conversation history
    history.forEach(msg => {
        messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        });
    });
    
    // Add current message
    messages.push({
        role: 'user',
        content: messageText
    });
    
    // Keep only last 10 messages to avoid token limits
    if (messages.length > 10) {
        messages.splice(0, messages.length - 10);
    }
    
    // Call real Claude API
    const response = await callClaudeAPI(messages);
    
    // Update conversation history
    history.push({
        role: 'user',
        content: messageText,
        timestamp: new Date().toISOString()
    });
    
    history.push({
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
    });
    
    // Keep history manageable
    if (history.length > 20) {
        history.splice(0, history.length - 20);
    }
    
    return response;
}

// MCP Server Integration (Alternative approach)
async function callMCPServer(tool, parameters) {
    try {
        console.log(`🔧 Calling MCP server tool: ${tool}`);
        
        // This would call your actual MCP servers
        // For now, we'll simulate the call
        
        switch (tool) {
            case 'send_smart_reply':
                // This would integrate with your whatsapp.js MCP server
                return await simulateMCPSmartReply(parameters);
                
            case 'check_availability':
                // This would integrate with your hotel-management.js MCP server
                return await simulateMCPAvailability(parameters);
                
            case 'get_hotel_info':
                // Get hotel information
                return await simulateMCPHotelInfo(parameters);
                
            default:
                throw new Error(`Unknown MCP tool: ${tool}`);
        }
    } catch (error) {
        console.error(`❌ MCP server error for ${tool}:`, error);
        throw error;
    }
}

// Simulated MCP server responses (replace with actual MCP calls)
async function simulateMCPSmartReply(params) {
    // This should call your actual MCP whatsapp.js server
    // For now, return a structured response
    return {
        reply: `I understand you're asking about "${params.guest_message}". Let me connect you with our team for personalized assistance.`,
        suggested_actions: ['call_hotel', 'request_callback'],
        context: 'general_inquiry'
    };
}

async function simulateMCPAvailability(params) {
    // This should call your actual MCP hotel-management.js server
    return {
        available: true,
        rooms: ['Heritage Suite', 'Garden View Room', 'Farm View Room'],
        message: 'We have availability for your requested dates. Please call to confirm your booking.'
    };
}

async function simulateMCPHotelInfo(params) {
    return {
        name: 'Darbar Heritage Farmstay',
        rooms: 13,
        features: ['Organic Farm', 'Heritage Experience', 'Farm-to-table Dining'],
        contact: '+91-9910364826'
    };
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, message, contextMessageId = null) {
    console.log('\n📤 Sending AI-powered WhatsApp response...');
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
            console.log('✅ AI-powered response sent successfully!');
            console.log('  Message ID:', data.messages[0].id);
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

// Process incoming message with real AI
async function processIncomingMessage(message) {
    const guestPhone = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    
    console.log('\n📥 Processing message with real AI:');
    console.log('  From:', guestPhone);
    console.log('  Message:', messageText);
    console.log('  ID:', messageId);
    
    if (!messageText.trim()) {
        console.log('⏭️ Skipping non-text message');
        return;
    }
    
    try {
        // Generate response using real Claude AI
        const aiResponse = await generateIntelligentResponse(guestPhone, messageText);
        console.log('🤖 Claude AI generated response:', aiResponse.substring(0, 150) + '...');
        
        // Send the AI response
        const result = await sendWhatsAppMessage(guestPhone, aiResponse, messageId);
        
        if (result.success) {
            console.log('✅ Real AI response sent successfully!');
            
            // Optional: Call MCP servers for additional processing
            try {
                await callMCPServer('send_smart_reply', {
                    guest_phone: guestPhone,
                    guest_message: messageText,
                    ai_response: aiResponse,
                    message_id: messageId
                });
            } catch (mcpError) {
                console.log('⚠️ MCP server call failed (non-critical):', mcpError.message);
            }
            
        } else {
            console.log('❌ AI response failed:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error in AI processing:', error);
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'ChatHotel Real AI Assistant',
        version: '3.0.0',
        ai_powered: true,
        claude_integration: !!CLAUDE_API_KEY,
        mcp_integration: true,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        service: 'ChatHotel Real AI',
        claude_available: !!CLAUDE_API_KEY,
        uptime: process.uptime()
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
    console.log('\n=== INCOMING WEBHOOK ===');
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

// Test endpoint for AI responses
app.post('/test-ai', async (req, res) => {
    const { message, phone = 'test' } = req.body;
    
    try {
        const aiResponse = await generateIntelligentResponse(phone, message);
        res.json({
            success: true,
            input: message,
            ai_response: aiResponse,
            powered_by: CLAUDE_API_KEY ? 'Claude API' : 'Fallback'
        });
    } catch (error) {
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
    res.json({ phone, history });
});

// Server startup
app.listen(PORT, () => {
    console.log('\n🚀 ChatHotel Real AI Assistant Starting...');
    console.log('='.repeat(60));
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🤖 Claude API: ${CLAUDE_API_KEY ? '✅ Configured' : '❌ Not configured (using fallback)'}`);
    console.log(`🔧 MCP Servers: Ready for integration`);
    console.log(`📱 WhatsApp: ${WHATSAPP_ACCESS_TOKEN ? '✅ Ready' : '❌ Not configured'}`);
    console.log('');
    console.log('🧠 AI Features:');
    console.log('   ✅ Real Claude AI understanding');
    console.log('   ✅ Context-aware conversations');  
    console.log('   ✅ Natural language processing');
    console.log('   ✅ MCP server integration ready');
    console.log('');
    console.log('🧪 Test AI: POST /test-ai with {"message": "your test"}');
    console.log('💬 View conversations: GET /conversations/{phone}');
    console.log('='.repeat(60));
});

process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down Real AI Assistant...');
    process.exit(0);
});