import express from 'express';
import { sendPaymentNotificationEmail } from '../services/emailService.js';

const router = express.Router();

// Test email endpoint
router.post('/test-email', async (req, res) => {
  try {
    console.log('🧪 Testing email functionality...');
    
    // Sample test data
    const testUserInfo = {
      firstName: 'Test',
      lastName: 'User',
      email: 'hasindus48@gmail.com' // Using your email for testing
    };
    
    const testPaymentInfo = {
      method: 'Carta di Credito',
      amount: 2900, // €29.00
      transactionId: `TEST_${Date.now()}`,
      cardNumber: '****-****-****-1234'
    };
    
    const testPlanInfo = {
      id: 'test-plan',
      name: 'Piano Test',
      price: 2900,
      type: 'Mensile'
    };
    
    console.log('📧 Sending test email to:', testUserInfo.email);
    
    const result = await sendPaymentNotificationEmail(testUserInfo, testPaymentInfo, testPlanInfo);
    
    if (result.success) {
      console.log('✅ Test email sent successfully!');
      res.json({
        success: true,
        message: 'Test email sent successfully!',
        messageId: result.messageId,
        recipient: testUserInfo.email
      });
    } else {
      console.log('❌ Test email failed:', result.error);
      res.status(500).json({
        success: false,
        message: 'Test email failed',
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Test email error',
      error: error.message
    });
  }
});

// Check email configuration status
router.get('/email-status', async (req, res) => {
  try {
    const brevoEmail = process.env.BREVO_EMAIL;
    const brevoApiKey = process.env.BREVO_API_KEY;
    
    const status = {
      configured: !!(brevoEmail && brevoApiKey),
      email: brevoEmail ? brevoEmail.replace(/(.{3}).*@/, '$1***@') : 'Not set',
      apiKey: brevoApiKey ? `${brevoApiKey.substring(0, 10)}***` : 'Not set',
      timestamp: new Date().toISOString()
    };
    
    console.log('📧 Email configuration status:', status);
    
    res.json({
      success: true,
      status: status
    });
    
  } catch (error) {
    console.error('❌ Email status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
