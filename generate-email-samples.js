import { sendPaymentNotificationEmail } from './services/emailService.js';
import fs from 'fs';

// Temporary function to generate and save HTML email templates
const generateAndSaveEmailHTML = (userInfo, paymentData, planData) => {
  const currentDate = new Date().toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const isFreeRegistration = (paymentData && paymentData.isFreeRegistration !== undefined) 
    ? paymentData.isFreeRegistration 
    : (!planData.price || planData.price === 0);
    
  const headerTitle = isFreeRegistration ? '🎉 Benvenuto in SimolyAI!' : '🎉 Pagamento Completato!';
  const welcomeMessage = isFreeRegistration 
    ? 'La tua registrazione è stata completata con successo! Benvenuto in <strong>SimolyAI</strong>.' 
    : 'Il tuo pagamento è stato elaborato con successo! Benvenuto in <strong>SimolyAI</strong>. Di seguito trovi i dettagli della tua transazione:';

  return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${isFreeRegistration ? 'Registrazione Completata' : 'Payment Confirmation'} - SimolyAI</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 40px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { padding: 40px; }
        .success-icon { text-align: center; margin-bottom: 30px; }
        .success-icon .icon { width: 80px; height: 80px; background-color: #28a745; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 40px; color: white; }
        .greeting { font-size: 18px; margin-bottom: 20px; color: #2c3e50; }
        .info-section { background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0; }
        .info-title { font-size: 16px; font-weight: 600; color: #495057; margin-bottom: 15px; border-bottom: 2px solid #e9ecef; padding-bottom: 8px; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
        .info-row:last-child { border-bottom: none; margin-bottom: 0; }
        .info-label { font-weight: 500; color: #6c757d; }
        .info-value { font-weight: 600; color: #2c3e50; }
        .highlight { background-color: #e7f3ff; border-left: 4px solid #007bff; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 25px 0; text-align: center; }
        .footer { background-color: #2c3e50; color: #ecf0f1; padding: 30px 40px; text-align: center; font-size: 14px; }
        .footer a { color: #3498db; text-decoration: none; }
        .divider { border: none; border-top: 2px solid #e9ecef; margin: 30px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${headerTitle}</h1>
        </div>
        
        <div class="content">
          <div class="success-icon">
            <div class="icon">✓</div>
          </div>
          
          <div class="greeting">
            Ciao <strong>${userInfo.firstName || userInfo.name}</strong>,
          </div>
          
          <p>${welcomeMessage}</p>
          
          <div class="info-section">
            <div class="info-title">👤 Informazioni Account</div>
            <div class="info-row">
              <span class="info-label">Nome:</span>
              <span class="info-value">${userInfo.firstName || ''} ${userInfo.lastName || ''}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Email:</span>
              <span class="info-value">${userInfo.email}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Data Registrazione:</span>
              <span class="info-value">${currentDate}</span>
            </div>
          </div>
          
          <div class="info-section">
            <div class="info-title">📋 Dettagli Piano</div>
            <div class="info-row">
              <span class="info-label">Piano Selezionato:</span>
              <span class="info-value">${planData.name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Prezzo:</span>
              <span class="info-value">${isFreeRegistration ? 'Gratuito' : '€' + (planData.price / 100).toFixed(2)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Tipo:</span>
              <span class="info-value">${planData.type || 'Mensile'}</span>
            </div>
          </div>
          
          ${!isFreeRegistration ? `
          <div class="info-section">
            <div class="info-title">💳 Informazioni Pagamento</div>
            <div class="info-row">
              <span class="info-label">Metodo di Pagamento:</span>
              <span class="info-value">${paymentData.method}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Importo Totale:</span>
              <span class="info-value">€${(paymentData.amount || planData.price) / 100}</span>
            </div>
            <div class="info-row">
              <span class="info-label">ID Transazione:</span>
              <span class="info-value">${paymentData.transactionId}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Stato:</span>
              <span class="info-value" style="color: #28a745;">✅ Completato</span>
            </div>
          </div>
          ` : ''}
          
          <div class="highlight">
            <strong>🚀 Il tuo account è ora attivo!</strong><br>
            Puoi iniziare subito a utilizzare tutte le funzionalità del tuo piano ${planData.name}.
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:8081'}/dashboard" class="cta-button">
              Accedi alla Dashboard
            </a>
          </div>
          
          <hr class="divider">
          
          <p>Se hai domande o hai bisogno di assistenza, non esitare a contattarci:</p>
          <ul>
            <li>📧 Email: support@simolyai.com</li>
            <li>📞 Telefono: +39 XXX XXX XXXX</li>
            <li>💬 Chat: Disponibile dalla dashboard</li>
          </ul>
          
          <p>Grazie per aver scelto <strong>SimolyAI</strong>!</p>
        </div>
        
        <div class="footer">
          <p>
            © 2024 SimolyAI. Tutti i diritti riservati.<br>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:8081'}/privacy-policy">Privacy Policy</a> | 
            <a href="${process.env.FRONTEND_URL || 'http://localhost:8081'}/terms-of-service">Termini di Servizio</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Test data for paid plan
const testPaidPlan = {
  userInfo: {
    email: 'test@example.com',
    firstName: 'Mario',
    lastName: 'Rossi'
  },
  paymentData: {
    method: 'Carta di Credito',
    transactionId: 'TXN_123456789',
    amount: 2999,
    isFreeRegistration: false
  },
  planData: {
    name: 'Piano Premium',
    price: 2999,
    type: 'Mensile'
  }
};

// Test data for free plan  
const testFreePlan = {
  userInfo: {
    email: 'test@example.com',
    firstName: 'Mario',
    lastName: 'Rossi'
  },
  paymentData: {
    method: 'Registrazione Online',
    transactionId: 'REG_123456789',
    amount: 0,
    isFreeRegistration: true
  },
  planData: {
    name: 'Piano Gratuito',
    price: 0,
    type: 'Mensile'
  }
};

console.log('🧪 Generating email templates...\n');

// Generate paid plan email
const paidPlanHTML = generateAndSaveEmailHTML(testPaidPlan.userInfo, testPaidPlan.paymentData, testPaidPlan.planData);
fs.writeFileSync('paid-plan-email.html', paidPlanHTML);
console.log('✅ Paid plan email saved to: paid-plan-email.html');

// Generate free plan email
const freePlanHTML = generateAndSaveEmailHTML(testFreePlan.userInfo, testFreePlan.paymentData, testFreePlan.planData);
fs.writeFileSync('free-plan-email.html', freePlanHTML);
console.log('✅ Free plan email saved to: free-plan-email.html');

console.log('\n📧 Email templates have been generated!');
console.log('You can open the HTML files in a browser to see exactly how the emails look.');
console.log('\nPaid plan email includes:');
console.log('- Payment method: ' + testPaidPlan.paymentData.method);
console.log('- Transaction ID: ' + testPaidPlan.paymentData.transactionId);
console.log('- Amount: €' + (testPaidPlan.paymentData.amount / 100).toFixed(2));
console.log('\nFree plan email excludes payment information as expected.');
