#!/usr/bin/env node

/**
 * Gemini API Test
 * Tests your Google Gemini API key
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGeminiAPI() {
  console.log('🚀 Gemini API Test\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  
  if (!apiKey) {
    console.log('❌ No API key found in .env file');
    console.log('\n📝 To fix this:');
    console.log('1. Create a .env file in your project root');
    console.log('2. Add: GOOGLE_AI_API_KEY=your_api_key_here');
    console.log('3. Get your API key from: https://ai.google.dev/');
    return;
  }
  
  console.log('✅ API Key found');
  console.log(`Key: ${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 10)}\n`);
  
  // List available models first
  console.log('📋 Checking available models...');
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey }
    });
    
    if (response.ok) {
      const data = await response.json();
      const models = data.models || [];
      const workingModels = models.filter(model => 
        model.supportedGenerationMethods && 
        model.supportedGenerationMethods.includes('generateContent')
      );
      
      console.log(`✅ Found ${workingModels.length} working models:`);
      workingModels.slice(0, 5).forEach((model, index) => {
        const name = model.name.replace('models/', '');
        console.log(`   ${index + 1}. ${name}`);
      });
      if (workingModels.length > 5) {
        console.log(`   ... and ${workingModels.length - 5} more models`);
      }
      console.log('');
    } else {
      console.log('❌ Could not list models, proceeding with test...\n');
    }
  } catch (error) {
    console.log('❌ Error listing models, proceeding with test...\n');
  }
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Try the most basic approach
    console.log('🧪 Testing API connection...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const result = await model.generateContent("Test");
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ SUCCESS!');
    console.log('📤 Response:', text);
    console.log('\n🎉 Your Gemini API is working!');
    console.log('🚀 You can now run: npm run dev');
    
  } catch (error) {
    console.log('\n❌ FAILED:', error.message);
    
    // Provide specific guidance based on the error
    if (error.message.includes('404') && error.message.includes('not found')) {
      console.log('\n💡 This error means:');
      console.log('1. Your API key is valid (connection works)');
      console.log('2. But the model name "gemini-pro" is not available');
      console.log('3. This might be a region or project configuration issue');
      console.log('\n🔧 Try these solutions:');
      console.log('1. Go to https://ai.google.dev/');
      console.log('2. Make sure you\'re in the right region');
      console.log('3. Check if Gemini API is enabled in your Google Cloud project');
      console.log('4. Try creating a new API key');
    } else if (error.message.includes('API key')) {
      console.log('\n💡 API Key Issue:');
      console.log('1. Check your API key at https://ai.google.dev/');
      console.log('2. Make sure you copied the full key');
      console.log('3. Try generating a new key');
    } else {
      console.log('\n💡 General troubleshooting:');
      console.log('1. Check your internet connection');
      console.log('2. Verify your Google Cloud project settings');
      console.log('3. Make sure billing is enabled');
    }
  }
}

testGeminiAPI();
