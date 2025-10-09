import axios from 'axios';

async function testQuestionnaireProgressAPI() {
  try {
    console.log('🔍 Testing questionnaire progress API...');
    
    const response = await axios.get('http://localhost:4000/api/admin/users/questionnaire-progress', {
      headers: { 
        'x-admin-key': 'lB2@#mR8!nP6$hQ7^jX5*vY3&zK9+wA1',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Success! Response status:', response.status);
    console.log('📊 Response data:', JSON.stringify(response.data, null, 2));
    
    // Test individual user endpoint
    console.log('\n🔍 Testing individual user questionnaire progress...');
    
    // Get a user ID from the response
    const userData = response.data.data;
    const userIds = Object.keys(userData);
    
    if (userIds.length > 0) {
      const testUserId = userIds[0];
      console.log(`Testing with user ID: ${testUserId}`);
      
      const userResponse = await axios.get(`http://localhost:4000/api/admin/users/${testUserId}/questionnaire-progress`, {
        headers: { 
          'x-admin-key': 'lB2@#mR8!nP6$hQ7^jX5*vY3&zK9+wA1',
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Individual user success! Response status:', userResponse.status);
      console.log('👤 User progress data:', JSON.stringify(userResponse.data, null, 2));
    }
    
  } catch (error) {
    console.log('❌ Error:', error.response?.status || error.message);
    console.log('Error details:', error.response?.data || error.message);
    if (error.response?.data) {
      console.log('Full error response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testQuestionnaireProgressAPI();