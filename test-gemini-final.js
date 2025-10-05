#!/usr/bin/env node

/**
 * Gemini API Test with Medical Classification
 * Tests API and medical amount classification
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGeminiAPI() {
  console.log('🎯 Gemini API Test\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  
  if (!apiKey) {
    console.log('❌ No API key found. Add GOOGLE_AI_API_KEY to your .env file');
    console.log('Get your key from: https://ai.google.dev/');
    return;
  }
  
  console.log('✅ API Key found:', apiKey.substring(0, 15) + '...\n');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // First, list all available models
  console.log('📋 Listing available models...');
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: {
        'x-goog-api-key': apiKey
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const models = data.models || [];
      
      console.log(`✅ Found ${models.length} available models:\n`);
      
      // Show models that support generateContent
      const workingModels = models.filter(model => 
        model.supportedGenerationMethods && 
        model.supportedGenerationMethods.includes('generateContent')
      );
      
      console.log('🚀 Models that support generateContent:');
      workingModels.forEach((model, index) => {
        const name = model.name.replace('models/', '');
        console.log(`   ${index + 1}. ${name}`);
      });
      
      console.log(`\n📊 Total: ${workingModels.length} working models out of ${models.length} total models\n`);
      
    } else {
      console.log('❌ Failed to list models:', response.status, response.statusText);
    }
  } catch (error) {
    console.log('❌ Error listing models:', error.message);
  }
  
  // Model names that work with your API
  const modelNames = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];
  
  console.log('🧪 Testing different model names...\n');
  
  for (const modelName of modelNames) {
    try {
      console.log(`Testing: ${modelName}...`);
      
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // Simple test prompt
      const result = await Promise.race([
        model.generateContent("Say 'API test successful'"),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 8000)
        )
      ]);
      
      const response = await result.response;
      const text = response.text();
      
      console.log(`✅ SUCCESS with ${modelName}!`);
      console.log(`📤 Response: ${text}`);
      
      // Test with medical amount classification
      console.log('\n🧪 Testing medical amount classification...');
      const medicalResult = await model.generateContent(
        "Classify these medical amounts: Total: $450.75 | Insurance Paid: $300.50 | Patient Due: $150.25"
      );
      
      const medicalResponse = await medicalResult.response;
      const medicalText = medicalResponse.text();
      
      console.log('✅ Medical classification test:');
      console.log(medicalText);
      
      console.log('\n🎉 Your Gemini API is working perfectly!');
      console.log('🚀 You can now run: npm run dev');
      return;
      
    } catch (error) {
      console.log(`❌ ${modelName}: ${error.message.substring(0, 80)}...`);
    }
  }
  
  console.log('\n❌ All models failed. Possible issues:');
  console.log('1. API key might be invalid');
  console.log('2. Gemini API might not be enabled');
  console.log('3. Billing/quota issues');
  console.log('4. Network connectivity problems');
  console.log('\n💡 Check your settings at: https://ai.google.dev/');
}

testGeminiAPI();
