// WhatsApp Business API Debug Script for ChatHotel
// No external dependencies required

// ===== CONFIGURE YOUR CREDENTIALS HERE =====
// Copy these values from your .env file or Facebook Developer Console
const WHATSAPP_ACCESS_TOKEN = "EAAH237TIRZC4BO1l5jA3eF9x01Q1tYahcZCzJqQVZBaWXSZBtiljBZBxAeDyWPUZAY8sshUfnZC614nCTaZB6a5LvQwrbfyxlO5W4EEQxqJc8emiLiI5f0bIyxW7o3pZCfWdBB5S4DURJnvekNAGoM3vZAGsSGXfB2JzX1dKWN9AKQ0uabgwkYpZA8osHirD9qF9eEmHPRgehNdhgzFOvqBCW7APrLIkjBz";
const WHATSAPP_PHONE_NUMBER_ID = "639487732587057"; 
const WHATSAPP_BUSINESS_ACCOUNT_ID = "1739122116811931";

// Test phone number (your hotel's number or a test number)
const TEST_PHONE_NUMBER = "+919702456293"; // Your hotel's number from the doc

// ===== DEBUG FUNCTIONS =====

// 1. VERIFY ENVIRONMENT VARIABLES
console.log('=== ENVIRONMENT CHECK ===');
console.log('Access Token exists:', !!WHATSAPP_ACCESS_TOKEN && WHATSAPP_ACCESS_TOKEN !== "YOUR_ACCESS_TOKEN_HERE");
console.log('Phone Number ID exists:', !!WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_PHONE_NUMBER_ID !== "YOUR_PHONE_NUMBER_ID_HERE");
console.log('Business Account ID exists:', !!WHATSAPP_BUSINESS_ACCOUNT_ID && WHATSAPP_BUSINESS_ACCOUNT_ID !== "YOUR_BUSINESS_ACCOUNT_ID_HERE");

if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === "YOUR_ACCESS_TOKEN_HERE") {
    console.log('\n❌ SETUP REQUIRED: Please add your credentials to the top of this file');
    console.log('Get them from: https://developers.facebook.com/apps → Your App → WhatsApp → API Setup');
    process.exit(1);
}

// 2. TEST ACCESS TOKEN VALIDITY
async function testAccessToken() {
    console.log('\n=== ACCESS TOKEN TEST ===');
    
    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/debug_token?input_token=${WHATSAPP_ACCESS_TOKEN}&access_token=${WHATSAPP_ACCESS_TOKEN}`);
        const data = await response.json();
        
        if (data.data) {
            console.log('✅ Access token is valid');
            console.log('App ID:', data.data.app_id);
            console.log('Expires:', data.data.expires_at === 0 ? 'Never (Permanent)' : new Date(data.data.expires_at * 1000));
            console.log('Scopes:', data.data.scopes);
            
            // Check if it has the right permissions
            const requiredScopes = ['whatsapp_business_messaging', 'whatsapp_business_management'];
            const hasRequired = requiredScopes.every(scope => data.data.scopes?.includes(scope));
            
            if (hasRequired) {
                console.log('✅ Has required WhatsApp permissions');
            } else {
                console.log('⚠️  Missing required permissions. Needs:', requiredScopes);
                console.log('Current scopes:', data.data.scopes);
            }
        } else {
            console.log('❌ Access token invalid:', data.error);
            return false;
        }
    } catch (error) {
        console.log('❌ Token validation failed:', error.message);
        return false;
    }
    return true;
}

// 3. VERIFY PHONE NUMBER ID
async function verifyPhoneNumberId() {
    console.log('\n=== PHONE NUMBER VERIFICATION ===');
    
    try {
        const response = await fetch(
            `https://graph.facebook.com/v19.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/phone_numbers`,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`
                }
            }
        );
        
        const data = await response.json();
        
        if (data.data) {
            console.log('✅ Available phone numbers:');
            let foundMatch = false;
            data.data.forEach(phone => {
                console.log(`  📱 ID: ${phone.id}`);
                console.log(`     Number: ${phone.display_phone_number}`);
                console.log(`     Status: ${phone.status}`);
                console.log(`     Quality: ${phone.quality_rating || 'N/A'}`);
                console.log('');
                
                if (phone.id === WHATSAPP_PHONE_NUMBER_ID) {
                    console.log('✅ Your configured phone number ID matches!');
                    foundMatch = true;
                }
            });
            
            if (!foundMatch) {
                console.log('❌ Your WHATSAPP_PHONE_NUMBER_ID doesn\'t match any available numbers');
                console.log('Current config:', WHATSAPP_PHONE_NUMBER_ID);
            }
        } else {
            console.log('❌ Phone number fetch failed:', data.error);
            return false;
        }
    } catch (error) {
        console.log('❌ Phone verification failed:', error.message);
        return false;
    }
    return true;
}

// 4. SEND TEST MESSAGE
async function sendTestMessage(to, message) {
    console.log('\n=== SENDING TEST MESSAGE ===');
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
    
    console.log('Request URL:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
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
        
        console.log('Response Status:', response.status);
        console.log('Response Body:', JSON.stringify(data, null, 2));
        
        if (response.ok && data.messages) {
            console.log('✅ Message sent successfully!');
            console.log('Message ID:', data.messages[0].id);
            return { success: true, messageId: data.messages[0].id };
        } else {
            console.log('❌ Message failed to send');
            if (data.error) {
                console.log('Error Code:', data.error.code);
                console.log('Error Message:', data.error.message);
                console.log('Error Type:', data.error.type);
                
                // Provide specific troubleshooting
                if (data.error.code === 100) {
                    console.log('\n💡 SOLUTION: Invalid parameter or token issue');
                    console.log('   - Check your access token permissions');
                    console.log('   - Verify phone number ID is correct');
                }
                if (data.error.code === 131026) {
                    console.log('\n💡 SOLUTION: Message undeliverable');
                    console.log('   - Recipient may not have WhatsApp');
                    console.log('   - Ask recipient to message your business first');
                    console.log('   - Try a different phone number');
                }
                if (data.error.code === 131047) {
                    console.log('\n💡 SOLUTION: Rate limit exceeded');
                    console.log('   - Wait a few minutes before trying again');
                }
            }
            return { success: false, error: data.error || data };
        }
    } catch (error) {
        console.log('❌ Network error:', error.message);
        return { success: false, error: error.message };
    }
}

// 5. MAIN DEBUG ROUTINE
async function runDebugTests() {
    console.log('🚀 ChatHotel WhatsApp Debug Test Starting...\n');
    
    // Test 1: Validate access token
    const tokenValid = await testAccessToken();
    if (!tokenValid) {
        console.log('\n❌ STOPPING: Fix access token first');
        return;
    }
    
    // Test 2: Verify phone number
    const phoneValid = await verifyPhoneNumberId();
    if (!phoneValid) {
        console.log('\n❌ STOPPING: Fix phone number configuration first');
        return;
    }
    
    // Test 3: Send test message
    const testMessage = "🏨 ChatHotel Debug Test - If you receive this, our WhatsApp API is working! 🎉";
    const result = await sendTestMessage(TEST_PHONE_NUMBER, testMessage);
    
    if (result.success) {
        console.log('\n🎉 SUCCESS! WhatsApp API is working correctly!');
        console.log('✅ Your sendWhatsAppReply() function should work now');
        console.log('✅ Check the recipient phone for the test message');
        console.log('\n📝 Next steps:');
        console.log('   1. Update your MCP server with the working credentials');
        console.log('   2. Test webhook by sending a message TO your business');
        console.log('   3. Deploy to production!');
    } else {
        console.log('\n❌ FAILED! Check the error details above');
        console.log('\n🔧 Most common fixes:');
        console.log('   1. Create a permanent access token (never expires)');
        console.log('   2. Add correct phone number ID from API Setup page');
        console.log('   3. Ask someone to message your business first');
        console.log('   4. Check Facebook Developer Console for restrictions');
    }
}

// 6. CONFIGURATION HELPER
function showConfigurationHelp() {
    console.log('\n📋 HOW TO GET YOUR CREDENTIALS:');
    console.log('1. Go to: https://developers.facebook.com/apps');
    console.log('2. Select your WhatsApp app');
    console.log('3. Go to: WhatsApp → API Setup');
    console.log('4. Copy:');
    console.log('   - Access Token (create permanent one)');
    console.log('   - Phone Number ID');
    console.log('   - WhatsApp Business Account ID');
    console.log('5. Update the credentials at the top of this file');
    console.log('6. Run: node debug-whatsapp.js');
}

// Run the debug if credentials are configured
if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_ACCESS_TOKEN !== "YOUR_ACCESS_TOKEN_HERE") {
    runDebugTests().catch(console.error);
} else {
    showConfigurationHelp();
}