import axios from 'axios';

console.log('🚀 Starting Simple Prompt Templates API Test');

const BASE_URL = 'http://localhost:4000';
const API_BASE = `${BASE_URL}/api/prompt-templates`;

async function testServer() {
  try {
    console.log('🔍 Testing server connection...');
    // Test directly with the API endpoint instead of root
    const response = await axios.get(`${API_BASE}/plan/test-plan-123`);
    console.log('✅ Server is accessible');
    return true;
  } catch (error) {
    console.log('❌ Server connection failed:', error.message);
    return false;
  }
}

async function testCreatePrompt() {
  try {
    console.log('\n🧪 Testing CREATE endpoint...');
    
    const testData = {
      plan_id: 'test-plan-123',
      questionnaire_id: 'test-questionnaire-456', 
      title: 'Test Prompt',
      content: 'Test content',
      system_prompt: 'Test system prompt',
      variables: [],
      sequence_index: 1,
      sections_data: {
        text: [],
        charts: [],
        tables: []
      },
      report_template: 'Test template'
    };
    
    console.log('📤 Sending POST request to:', API_BASE);
    
    const response = await axios.post(API_BASE, testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ CREATE Response Status:', response.status);
    console.log('✅ CREATE Response Data:', response.data);
    
    return response.data;
  } catch (error) {
    console.log('❌ CREATE failed');
    console.log('❌ Status:', error.response?.status);
    console.log('❌ Error:', error.response?.data || error.message);
    return null;
  }
}

async function testGetByPlan() {
  try {
    console.log('\n🧪 Testing GET by plan endpoint...');
    
    const url = `${API_BASE}/plan/test-plan-123`;
    console.log('📤 Sending GET request to:', url);
    
    const response = await axios.get(url);
    
    console.log('✅ GET Response Status:', response.status);
    console.log('✅ GET Response Data:', response.data);
    
    return response.data;
  } catch (error) {
    console.log('❌ GET by plan failed');
    console.log('❌ Status:', error.response?.status);
    console.log('❌ Error:', error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('📍 Testing against:', API_BASE);
  
  // Test server connection
  const serverOk = await testServer();
  if (!serverOk) {
    console.log('🛑 Stopping tests - server not accessible');
    return;
  }
  
  // Test create
  const createResult = await testCreatePrompt();
  
  // Test get by plan
  const getResult = await testGetByPlan();
  
  console.log('\n📊 Test completed');
}

runTests().catch(error => {
  console.error('💥 Test runner failed:', error);
});
